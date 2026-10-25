// Склейка панорамы 360° из серии снимков, сделанных поворотом на месте.
//
// 1. Кадры уменьшаются и переводятся в цилиндрическую проекцию.
// 2. Для каждой пары соседних кадров ищется сдвиг по горизонтали и вертикали
//    (по совпадению градиентов в зоне перекрытия).
// 3. Сумма сдвигов по кругу = длина окружности → из неё находится фокусное
//    расстояние камеры (угол обзора можно не знать заранее).
// 4. Яркость кадров выравнивается, кадры проецируются в равнопромежуточную
//    панораму 2:1 с плавным смешиванием на стыках; верх и низ (пол/потолок,
//    которые обычно не сняты) заполняются мягким градиентом.

const TAU = Math.PI * 2
const tick = () => new Promise((r) => setTimeout(r, 0))

async function loadSource(file, maxH) {
  let bmp
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bmp = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const k = Math.min(1, maxH / bmp.height)
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return { w, h, data: ctx.getImageData(0, 0, w, h).data }
}

function luma(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] }

/** Цилиндрическая проекция в оттенках серого + модуль градиента (для сравнения кадров) */
function cylGradient(src, f, outH) {
  const { w, h, data } = src
  const s = outH / h
  const fs = f * s
  const halfAng = Math.atan(w / 2 / f)
  const cw = Math.max(8, Math.floor(2 * halfAng * fs))
  const ch = outH
  const g = new Float32Array(cw * ch)
  const valid = new Uint8Array(cw * ch)
  for (let u = 0; u < cw; u++) {
    const a = (u - cw / 2) / fs
    const xs = f * Math.tan(a) + w / 2
    const ca = Math.cos(a)
    for (let v = 0; v < ch; v++) {
      const ys = ((v - ch / 2) / s) / ca + h / 2
      const xi = Math.round(xs), yi = Math.round(ys)
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue
      g[v * cw + u] = luma(data, (yi * w + xi) * 4)
      valid[v * cw + u] = 1
    }
  }
  const out = new Float32Array(cw * ch)
  const ok = new Uint8Array(cw * ch)
  for (let v = 1; v < ch - 1; v++) {
    for (let u = 1; u < cw - 1; u++) {
      const i = v * cw + u
      if (!valid[i] || !valid[i - 1] || !valid[i + 1] || !valid[i - cw] || !valid[i + cw]) continue
      out[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + cw] - g[i - cw])
      ok[i] = 1
    }
  }
  return { g: out, ok, lum: g, cw, ch, fs }
}

/** Лучший сдвиг кадра B относительно A: B начинается на s пикселей правее A, выше/ниже на dy */
function bestShift(A, B, s0) {
  let best = { score: Infinity, s: s0, dy: 0 }
  const sMin = Math.max(4, Math.floor(s0 * 0.55)), sMax = Math.min(A.cw - Math.floor(A.cw * 0.1), Math.ceil(s0 * 1.45))
  const dyMax = Math.round(A.ch * 0.06)
  for (let s = sMin; s <= sMax; s++) {
    const ov = A.cw - s
    if (ov < A.cw * 0.1) continue
    for (let dy = -dyMax; dy <= dyMax; dy++) {
      let sum = 0, n = 0
      for (let v = 4; v < A.ch - 4; v += 2) {
        const vb = v - dy
        if (vb < 1 || vb >= B.ch - 1) continue
        const ra = v * A.cw, rb = vb * B.cw
        for (let u = 0; u < ov; u += 2) {
          const ia = ra + s + u, ib = rb + u
          if (!A.ok[ia] || !B.ok[ib]) continue
          sum += Math.abs(A.g[ia] - B.g[ib])
          n++
        }
      }
      if (n < 60) continue
      const score = sum / n
      if (score < best.score) best = { score, s, dy }
    }
  }
  return best
}

function meanLumaOverlap(A, B, s, dy) {
  let sa = 0, sb = 0, n = 0
  const ov = A.cw - s
  for (let v = 2; v < A.ch - 2; v += 2) {
    const vb = v - dy
    if (vb < 0 || vb >= B.ch) continue
    for (let u = 0; u < ov; u += 2) {
      const ia = v * A.cw + s + u, ib = vb * B.cw + u
      if (!A.ok[ia] || !B.ok[ib]) continue
      sa += A.lum[ia]; sb += B.lum[ib]; n++
    }
  }
  return n ? { a: sa / n, b: sb / n } : null
}

/**
 * files — снимки по порядку поворота (по часовой стрелке).
 * Возвращает { blob, width, height, info }.
 */
export async function stitchPanorama(files, { onProgress = () => {}, outWidth = 4096, fovGuess } = {}) {
  const N = files.length
  if (N < 3) throw new Error('Нужно хотя бы 3 снимка')
  onProgress(0.02, 'Читаем снимки')
  const src = []
  for (let i = 0; i < N; i++) {
    src.push(await loadSource(files[i], 1100))
    onProgress(0.02 + 0.18 * ((i + 1) / N), 'Читаем снимки')
    await tick()
  }
  const { w, h } = src[0]
  // Начальная догадка об угле обзора: телефон вертикально ~50°, горизонтально ~65°
  const guess = (fovGuess ?? (w < h ? 50 : 65)) * Math.PI / 180
  let f = w / 2 / Math.tan(guess / 2)
  const step = TAU / N

  // --- выравнивание соседних кадров (на уменьшенных копиях) ---
  const SMALL = 150
  let shifts = []
  let reliable = false
  for (let pass = 0; pass < 2; pass++) {
    const cyl = src.map((s) => cylGradient(s, f, SMALL))
    const fs = cyl[0].fs
    const s0 = fs * step
    shifts = []
    for (let i = 0; i < N; i++) {
      const A = cyl[i], B = cyl[(i + 1) % N]
      shifts.push(bestShift(A, B, s0))
      onProgress(0.2 + 0.3 * ((pass * N + i + 1) / (2 * N)), 'Выравниваем кадры')
      await tick()
    }
    const total = shifts.reduce((a, b) => a + b.s, 0)
    const ratio = total / (TAU * fs)
    reliable = ratio > 0.65 && ratio < 1.5 && shifts.every((x) => Number.isFinite(x.score))
    if (!reliable) break
    f = f * ratio // уточнённое фокусное (угол обзора)
    if (Math.abs(ratio - 1) < 0.02) break
  }

  // Углы кадров
  const yaws = [0], tilts = [0]
  const cylSmall = cylGradient(src[0], f, SMALL)
  const fsSmall = cylSmall.fs
  if (reliable) {
    for (let i = 0; i < N - 1; i++) {
      yaws.push(yaws[i] + shifts[i].s / fsSmall)
      tilts.push(tilts[i] + Math.atan(-shifts[i].dy / fsSmall))
    }
    // невязка по кругу: распределяем равномерно
    const closeYaw = yaws[N - 1] + shifts[N - 1].s / fsSmall - TAU
    const closeTilt = tilts[N - 1] + Math.atan(-shifts[N - 1].dy / fsSmall)
    for (let i = 0; i < N; i++) {
      yaws[i] -= (closeYaw * i) / N
      tilts[i] -= (closeTilt * i) / N
    }
  } else {
    for (let i = 1; i < N; i++) { yaws.push(i * step); tilts.push(0) }
  }

  // Выравнивание яркости по перекрытиям
  const gains = [1]
  const cyl2 = src.map((s) => cylGradient(s, f, SMALL))
  for (let i = 0; i < N - 1; i++) {
    const m = reliable ? meanLumaOverlap(cyl2[i], cyl2[i + 1], shifts[i].s, shifts[i].dy) : null
    gains.push(gains[i] * (m && m.b > 5 ? m.a / m.b : 1))
  }
  const gMean = gains.reduce((a, b) => a + b, 0) / N
  for (let i = 0; i < N; i++) gains[i] = Math.min(1.6, Math.max(0.6, gains[i] / gMean))

  // --- рендер равнопромежуточной панорамы ---
  const W = outWidth, H = W / 2
  const out = new ImageData(W, H)
  const od = out.data
  const halfH = Math.atan(w / 2 / f) // половина угла обзора по горизонтали
  const covered = new Uint8Array(W * H)
  const topRow = new Int32Array(W).fill(-1)
  const botRow = new Int32Array(W).fill(-1)
  const vHalf = Math.atan(h / 2 / f) + Math.max(...tilts.map(Math.abs)) + 0.05
  const rowStart = Math.max(0, Math.floor((0.5 - vHalf / Math.PI) * H))
  const rowEnd = Math.min(H, Math.ceil((0.5 + vHalf / Math.PI) * H))
  const cosY = yaws.map(Math.cos), sinY = yaws.map(Math.sin)
  const cosT = tilts.map(Math.cos), sinT = tilts.map(Math.sin)

  for (let y = rowStart; y < rowEnd; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI
    const cl = Math.cos(lat), sl = Math.sin(lat)
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * TAU
      // направление луча: x — вправо, y — вверх, z — вперёд (при lon = 0)
      const dx = Math.sin(lon) * cl, dy = sl, dz = Math.cos(lon) * cl
      let r = 0, g = 0, b = 0, wsum = 0
      for (let k = 0; k < N; k++) {
        // поворот в систему кадра k: сначала по yaw, потом по наклону
        const x1 = dx * cosY[k] - dz * sinY[k]
        const z1 = dx * sinY[k] + dz * cosY[k]
        const y2 = dy * cosT[k] - z1 * sinT[k]
        const z2 = dy * sinT[k] + z1 * cosT[k]
        if (z2 <= 0.05) continue
        const px = f * (x1 / z2) + w / 2
        const py = h / 2 - f * (y2 / z2)
        if (px < 0 || py < 0 || px > w - 1.001 || py > h - 1.001) continue
        // вес: ближе к центру кадра — больше (плавные швы)
        const ax = 1 - Math.abs(Math.atan2(x1, z2)) / halfH
        const ay = Math.min(1, Math.min(py, h - 1 - py) / (h * 0.08))
        const wt = Math.max(0, ax) ** 2 * ay + 1e-4
        // билинейная выборка
        const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0
        const d = src[k].data, sw = w * 4
        const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + sw, i11 = i01 + 4
        const gk = gains[k] * wt
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy
        r += (d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11) * gk
        g += (d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11) * gk
        b += (d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11) * gk
        wsum += wt
      }
      if (wsum > 0) {
        const o = (y * W + x) * 4
        od[o] = Math.min(255, r / wsum); od[o + 1] = Math.min(255, g / wsum); od[o + 2] = Math.min(255, b / wsum); od[o + 3] = 255
        covered[y * W + x] = 1
        if (topRow[x] < 0) topRow[x] = y
        botRow[x] = y
      }
    }
    if (y % 24 === 0) {
      onProgress(0.5 + 0.45 * ((y - rowStart) / Math.max(1, rowEnd - rowStart)), 'Склеиваем панораму')
      await tick()
    }
  }

  // --- верх и низ: мягкий градиент от края снятой области ---
  const avg = (rowsOf) => {
    let r = 0, g = 0, b = 0, n = 0
    for (let x = 0; x < W; x += 4) {
      const y = rowsOf[x]
      if (y < 0) continue
      const o = (y * W + x) * 4
      r += od[o]; g += od[o + 1]; b += od[o + 2]; n++
    }
    return n ? [r / n, g / n, b / n] : [200, 200, 200]
  }
  const ceil = avg(topRow), floor = avg(botRow)
  // Цвет края снятой области, размытый по горизонтали (чтобы не было полос)
  const edgeColors = (rows, fallback) => {
    const raw = new Float32Array(W * 3)
    for (let x = 0; x < W; x++) {
      const y = rows[x]
      for (let c = 0; c < 3; c++) raw[x * 3 + c] = y >= 0 ? od[(y * W + x) * 4 + c] : fallback[c]
    }
    const R = 96, outC = new Float32Array(W * 3)
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let i = -R; i <= R; i++) acc += raw[(((i % W) + W) % W) * 3 + c]
      for (let x = 0; x < W; x++) {
        outC[x * 3 + c] = acc / (2 * R + 1)
        acc += raw[((x + R + 1) % W) * 3 + c] - raw[(((x - R) % W + W) % W) * 3 + c]
      }
    }
    return outC
  }
  const topC = edgeColors(topRow, ceil), botC = edgeColors(botRow, floor)
  const FADE = Math.round(H * 0.05) // полоса плавного перехода от края кадра
  for (let x = 0; x < W; x++) {
    const t = topRow[x], bt = botRow[x]
    const tEnd = t >= 0 ? t : H / 2
    for (let y = 0; y < tEnd; y++) {
      const k = Math.max(0, 1 - (tEnd - y) / (tEnd * 0.6)) ** 1.5 // у края — цвет края, выше — средний «потолок»
      const o = (y * W + x) * 4
      for (let c = 0; c < 3; c++) od[o + c] = ceil[c] + (topC[x * 3 + c] - ceil[c]) * k
      od[o + 3] = 255
    }
    const bStart = bt >= 0 ? bt + 1 : H / 2
    for (let y = bStart; y < H; y++) {
      const span = H - bStart
      const k = Math.max(0, 1 - (y - bStart) / (span * 0.6)) ** 1.5
      const o = (y * W + x) * 4
      for (let c = 0; c < 3; c++) od[o + c] = floor[c] + (botC[x * 3 + c] - floor[c]) * k
      od[o + 3] = 255
    }
    // мягкий шов: несколько строк снятой области у края смешиваем с заливкой
    for (let i = 0; i < FADE && t >= 0; i++) {
      const y = t + i, o = (y * W + x) * 4, a = 1 - i / FADE
      if (y >= H) break
      for (let c = 0; c < 3; c++) od[o + c] = od[o + c] * (1 - a * 0.85) + topC[x * 3 + c] * a * 0.85
    }
    for (let i = 0; i < FADE && bt >= 0; i++) {
      const y = bt - i, o = (y * W + x) * 4, a = 1 - i / FADE
      if (y < 0) break
      for (let c = 0; c < 3; c++) od[o + c] = od[o + c] * (1 - a * 0.85) + botC[x * 3 + c] * a * 0.85
    }
    // дыры внутри полосы (если кадры не покрыли) — копируем соседа сверху
    for (let y = Math.max(1, t); y <= bt; y++) {
      if (covered[y * W + x]) continue
      const o = (y * W + x) * 4, p = ((y - 1) * W + x) * 4
      od[o] = od[p]; od[o + 1] = od[p + 1]; od[o + 2] = od[p + 2]; od[o + 3] = 255
    }
  }

  onProgress(0.97, 'Сохраняем')
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d').putImageData(out, 0, 0)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
  onProgress(1, 'Готово')
  const fovDeg = (2 * Math.atan(w / 2 / f) * 180) / Math.PI
  return {
    blob, width: W, height: H,
    info: { aligned: reliable, fov: Math.round(fovDeg), frames: N, yaws: yaws.map((a) => (a * 180) / Math.PI) },
  }
}
