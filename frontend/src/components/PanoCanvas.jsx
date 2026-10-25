import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Просмотр равнопромежуточной панорамы 2:1 на WebGL без сторонних библиотек.
// yaw — по часовой стрелке (0 = центр изображения), pitch — вверх.

const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }`
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform sampler2D tex;
uniform vec3 F; uniform vec3 R; uniform vec3 U;
uniform float t; uniform float aspect;
const float PI = 3.141592653589793;
void main(){
  vec3 d = normalize(F + v.x * t * aspect * R + v.y * t * U);
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  gl_FragColor = texture2D(tex, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI));
}`

const RAD = Math.PI / 180
const clamp = (v, a, b) => Math.min(Math.max(v, a), b)

function basis(yaw, pitch) {
  const y = yaw * RAD, p = pitch * RAD
  const F = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)]
  const R = [Math.cos(y), 0, Math.sin(y)]
  const U = [-Math.sin(y) * Math.sin(p), Math.cos(p), Math.cos(y) * Math.sin(p)]
  return { F, R, U }
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * props:
 *  previewUrl, url — превью (быстро) и полное изображение
 *  initialYaw, initialPitch
 *  hotspots: [{ key, yaw, pitch, render: () => ReactNode }]
 *  onViewClick(yaw, pitch) — клик по панораме (не по метке, без перетаскивания)
 *  onViewChange({yaw, pitch, fov})
 * ref: { lookAt(yaw, pitch, animate), getView() }
 */
const PanoCanvas = forwardRef(function PanoCanvas(
  { previewUrl, url, initialYaw = 0, initialPitch = 0, hotspots = [], onViewClick, onViewChange, className = '' },
  ref,
) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const glRef = useRef(null)
  const view = useRef({ yaw: initialYaw, pitch: initialPitch, fov: 80 })
  const anim = useRef(null)
  const dirty = useRef(true)
  const hsEls = useRef(new Map())
  const hsRef = useRef(hotspots)
  hsRef.current = hotspots
  const cbRef = useRef({ onViewClick, onViewChange })
  cbRef.current = { onViewClick, onViewChange }
  const [status, setStatus] = useState('loading') // loading | ready | error | nogl
  const [fallbackSrc, setFallbackSrc] = useState(null)

  useImperativeHandle(ref, () => ({
    lookAt(yaw, pitch = view.current.pitch, animate = true) {
      if (!animate) { view.current = { ...view.current, yaw, pitch }; dirty.current = true; return }
      const from = { ...view.current }
      const dy = ((((yaw - from.yaw + 180) % 360) + 360) % 360) - 180
      anim.current = { t0: performance.now(), dur: 650, from, dy, dp: pitch - from.pitch }
    },
    getView: () => ({ ...view.current }),
  }))

  // --- WebGL ---
  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false })
      || canvas.getContext('experimental-webgl')
    if (!gl) { setStatus('nogl'); return }
    const sh = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setStatus('nogl'); return }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    glRef.current = {
      gl, prog, tex, hasTex: false,
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      u: {
        F: gl.getUniformLocation(prog, 'F'), R: gl.getUniformLocation(prog, 'R'), U: gl.getUniformLocation(prog, 'U'),
        t: gl.getUniformLocation(prog, 't'), aspect: gl.getUniformLocation(prog, 'aspect'),
      },
    }
    // Контекст не «теряем» явно: в StrictMode эффект запускается дважды на одном canvas
    return () => { glRef.current = null }
  }, [])

  // --- загрузка изображений: превью, затем полное ---
  useEffect(() => {
    let cancelled = false
    setStatus((s) => (s === 'nogl' ? s : 'loading'))
    setFallbackSrc(previewUrl || url)
    const upload = (img) => {
      const g = glRef.current
      if (!g || cancelled) return
      let source = img
      if (img.naturalWidth > g.maxTex) {
        const c = document.createElement('canvas')
        c.width = g.maxTex
        c.height = g.maxTex / 2
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        source = c
      }
      g.gl.bindTexture(g.gl.TEXTURE_2D, g.tex)
      g.gl.texImage2D(g.gl.TEXTURE_2D, 0, g.gl.RGB, g.gl.RGB, g.gl.UNSIGNED_BYTE, source)
      g.hasTex = true
      dirty.current = true
    }
    const first = previewUrl || url
    loadImage(first)
      .then((img) => { if (!cancelled) { upload(img); setStatus((s) => (s === 'nogl' ? s : 'ready')) } })
      .catch(() => !cancelled && setStatus('error'))
    if (previewUrl && url && url !== previewUrl) {
      loadImage(url).then((img) => { if (!cancelled) { upload(img); setFallbackSrc(url) } }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [previewUrl, url])

  // --- цикл отрисовки ---
  useEffect(() => {
    let raf
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        dirty.current = true
      }
      const a = anim.current
      if (a) {
        const k = Math.min(1, (now - a.t0) / a.dur)
        const e = 1 - Math.pow(1 - k, 3)
        view.current = { ...view.current, yaw: a.from.yaw + a.dy * e, pitch: a.from.pitch + a.dp * e }
        dirty.current = true
        if (k >= 1) anim.current = null
      }
      if (!dirty.current) return
      dirty.current = false
      const v = view.current
      const { F, R, U } = basis(v.yaw, v.pitch)
      const t = Math.tan((v.fov * RAD) / 2)
      const aspect = w / Math.max(h, 1)
      const g = glRef.current
      if (g && g.hasTex) {
        g.gl.viewport(0, 0, canvas.width, canvas.height)
        g.gl.uniform3fv(g.u.F, F); g.gl.uniform3fv(g.u.R, R); g.gl.uniform3fv(g.u.U, U)
        g.gl.uniform1f(g.u.t, t); g.gl.uniform1f(g.u.aspect, aspect)
        g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4)
      }
      // метки
      for (const hs of hsRef.current) {
        const el = hsEls.current.get(hs.key)
        if (!el) continue
        const hy = hs.yaw * RAD, hp = hs.pitch * RAD
        const D = [Math.sin(hy) * Math.cos(hp), Math.sin(hp), -Math.cos(hy) * Math.cos(hp)]
        const z = dot(D, F)
        if (z < 0.05) { el.style.visibility = 'hidden'; continue }
        const sx = dot(D, R) / (z * t * aspect)
        const sy = dot(D, U) / (z * t)
        if (Math.abs(sx) > 1.3 || Math.abs(sy) > 1.3) { el.style.visibility = 'hidden'; continue }
        el.style.visibility = 'visible'
        el.style.transform = `translate(${((sx + 1) / 2) * w}px, ${((1 - sy) / 2) * h}px)`
      }
      cbRef.current.onViewChange?.({ ...v })
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => { dirty.current = true }, [hotspots])

  // --- управление ---
  const pointers = useRef(new Map())
  const gesture = useRef(null)

  const screenToView = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect()
    const sx = ((clientX - r.left) / r.width) * 2 - 1
    const sy = 1 - ((clientY - r.top) / r.height) * 2
    const v = view.current
    const { F, R, U } = basis(v.yaw, v.pitch)
    const t = Math.tan((v.fov * RAD) / 2)
    const aspect = r.width / r.height
    const d = [0, 1, 2].map((i) => F[i] + sx * t * aspect * R[i] + sy * t * U[i])
    const n = Math.hypot(...d)
    return { yaw: Math.atan2(d[0] / n, -d[2] / n) / RAD, pitch: Math.asin(d[1] / n) / RAD }
  }

  const onPointerDown = (e) => {
    if (e.target.closest('[data-hotspot]')) return
    wrapRef.current.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    anim.current = null
    gesture.current = {
      start: { ...view.current }, x: e.clientX, y: e.clientY, moved: false,
      pinch: pointers.current.size === 2 ? pinchDist() : null,
    }
  }
  const pinchDist = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const h = wrapRef.current.clientHeight || 1
    if (pointers.current.size >= 2) {
      const d = pinchDist()
      if (g.pinch == null) { g.pinch = d; g.start = { ...view.current }; return }
      view.current.fov = clamp(g.start.fov * (g.pinch / d), 35, 100)
      g.moved = true
    } else {
      const k = view.current.fov / h
      const dx = e.clientX - g.x, dy = e.clientY - g.y
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true
      view.current.yaw = g.start.yaw - dx * k
      view.current.pitch = clamp(g.start.pitch + dy * k, -85, 85)
    }
    dirty.current = true
  }
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size === 0) {
      gesture.current = null
      if (g && !g.moved && cbRef.current.onViewClick) {
        const p = screenToView(e.clientX, e.clientY)
        cbRef.current.onViewClick(p.yaw, p.pitch)
      }
    } else if (g) {
      const [rest] = [...pointers.current.values()]
      gesture.current = { start: { ...view.current }, x: rest.x, y: rest.y, moved: true, pinch: null }
    }
  }

  useEffect(() => {
    const el = wrapRef.current
    const onWheel = (e) => {
      e.preventDefault()
      view.current.fov = clamp(view.current.fov * (e.deltaY > 0 ? 1.08 : 1 / 1.08), 35, 100)
      dirty.current = true
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onKeyDown = (e) => {
    const step = 8
    const v = view.current
    if (e.key === 'ArrowLeft') v.yaw -= step
    else if (e.key === 'ArrowRight') v.yaw += step
    else if (e.key === 'ArrowUp') v.pitch = clamp(v.pitch + step, -85, 85)
    else if (e.key === 'ArrowDown') v.pitch = clamp(v.pitch - step, -85, 85)
    else if (e.key === '+' || e.key === '=') v.fov = clamp(v.fov / 1.15, 35, 100)
    else if (e.key === '-') v.fov = clamp(v.fov * 1.15, 35, 100)
    else return
    e.preventDefault()
    dirty.current = true
  }

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden bg-[#11161d] outline-none ${className}`}
      tabIndex={0}
      role="application"
      aria-label="Панорама. Перетаскивайте, чтобы осмотреться; стрелки поворачивают обзор."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${status === 'nogl' ? 'hidden' : ''}`} />
      {status === 'nogl' && fallbackSrc && (
        <div className="absolute inset-0 overflow-x-auto">
          <img src={fallbackSrc} alt="Панорама" className="h-full max-w-none" />
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white/70">Загружаем панораму…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-white/80">
          Не удалось загрузить панораму. Проверьте соединение и откройте её ещё раз.
        </div>
      )}
      {status !== 'nogl' && hotspots.map((hs) => (
        <div
          key={hs.key}
          data-hotspot
          ref={(el) => { if (el) hsEls.current.set(hs.key, el); else hsEls.current.delete(hs.key) }}
          className="absolute left-0 top-0 z-10"
          style={{ visibility: 'hidden' }}
        >
          {hs.render()}
        </div>
      ))}
    </div>
  )
})

export default PanoCanvas
