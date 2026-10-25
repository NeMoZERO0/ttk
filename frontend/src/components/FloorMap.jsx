import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PoiIcon, Icon, ICONS } from '../icons.jsx'
import RoomsLayer from './RoomsLayer.jsx'
import { viewSize } from '../lib/plan.js'
import { fileUrl } from '../api.js'

const MIN_SCALE = 1
const MAX_SCALE = 4

/** Фон этажа без комнат: загруженный план из S3 → демо-заглушка → сетка */
export function planUrlFor(floor, mapSlug) {
  if (floor.plan_url) return fileUrl(floor.plan_url)
  if (mapSlug === 'demo') return `/plans/demo-${floor.level}.svg`
  return '/plans/generic.svg'
}

export default function FloorMap({
  floor, mapSlug, nodes, selectedId, onSelect,
  routeRuns = [], routeStartId, routeEndId, transitions = [], onGoFloor,
  rooms = [], building, viewpoints = [], onOpenPano,
}) {
  // Если на этаже есть комнаты — план рисуется из них (пропорции здания);
  // иначе — картинка плана с пропорциями картинки.
  const hasRooms = rooms.length > 0
  const imageAspect = floor.plan_url && floor.width && floor.height
  const { W, H } = hasRooms && !imageAspect
    ? viewSize(building)
    : { W: floor.width || 1000, H: floor.height || 700 }
  const wrapRef = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef(null)
  const [planFailed, setPlanFailed] = useState(false)

  // Размер «листа» плана: вписываем в контейнер с сохранением пропорций
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setBox({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Новый этаж — сбрасываем зум
  useEffect(() => { setView({ s: 1, x: 0, y: 0 }); setPlanFailed(false) }, [floor.id])

  // Поля: сверху — под название этажа, справа — под переключатель этажей
  const pad = { top: 68, right: 84, bottom: 20, left: 20 }
  const availW = box.w - pad.left - pad.right
  const availH = box.h - pad.top - pad.bottom
  const fit = Math.max(0.01, Math.min(availW / W, availH / H))
  const stageW = W * fit
  const stageH = H * fit
  const offX = pad.left + (availW - stageW) / 2
  const offY = pad.top + (availH - stageH) / 2

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor))
      if (s === MIN_SCALE) return { s, x: 0, y: 0 }
      const k = s / v.s
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }, [])

  // Колёсико мыши — зум вокруг курсора (нужен passive: false)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left - offX, e.clientY - r.top - offY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, offX, offY])

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || view.s === 1) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    // Клик по пустому месту плана снимает выделение
    if (d && !d.moved && !e.target.closest('button')) onSelect(null)
  }

  // Толщина линий в единицах viewBox, чтобы на экране она была постоянной
  const unit = W / Math.max(stageW, 1) / view.s
  // На узком экране — маркеры поменьше, пока план не приближен
  const compact = stageW * view.s < 560
  const routeIds = new Set(routeRuns.flatMap((r) => r.nodes.map((n) => n.id)))

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 overflow-hidden select-none touch-none ${view.s > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
    >
      {box.w > 0 && (
        <div
          className="absolute origin-top-left"
          style={{
            left: offX, top: offY, width: stageW, height: stageH,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
          }}
        >
          {hasRooms ? (
            <>
              <div className="absolute inset-0 rounded-md bg-[#F6F7F9] shadow-[0_1px_0_#D3D9E0,0_12px_32px_-12px_rgba(28,36,48,.28)]" />
              {floor.plan_url && !planFailed && (
                <img src={fileUrl(floor.plan_url)} onError={() => setPlanFailed(true)} alt="" draggable={false}
                  className="absolute inset-0 h-full w-full rounded-md" />
              )}
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                role="img" aria-label={`План: ${floor.name}`}>
                <RoomsLayer rooms={rooms} nodes={nodes} building={building} W={W} H={H} overImage={Boolean(floor.plan_url && !planFailed)} />
              </svg>
            </>
          ) : (
          <img
            src={planFailed ? '/plans/generic.svg' : planUrlFor(floor, mapSlug)}
            onError={() => setPlanFailed(true)}
            alt={`План: ${floor.name}`}
            draggable={false}
            className="absolute inset-0 h-full w-full rounded-md bg-white shadow-[0_1px_0_#D3D9E0,0_12px_32px_-12px_rgba(28,36,48,.28)]"
          />
          )}

          {/* Линия маршрута */}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {routeRuns.map((run, i) => {
              const pts = run.nodes.map((n) => `${n.x * W},${n.y * H}`).join(' ')
              return (
                <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={pts} stroke="#1C2430" strokeWidth={13 * unit} />
                  <polyline points={pts} stroke="#FFC627" strokeWidth={8 * unit} />
                  <polyline points={pts} stroke="#1C2430" strokeWidth={3.2 * unit}
                    strokeDasharray={`0 ${14 * unit}`} className="route-dash"
                    style={{ '--dash': `${-14 * unit}` }} />
                </g>
              )
            })}
          </svg>

          {/* Переходы между этажами */}
          {transitions.map((t) => (
            <button
              key={`${t.node.id}-${t.toFloor.id}`}
              type="button"
              onClick={() => onGoFloor(t.toFloor.id)}
              className="absolute z-20 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg ring-2 ring-signal transition hover:bg-[#2b3646]"
              style={{
                left: `${t.node.x * 100}%`, top: `${t.node.y * 100}%`,
                transform: `translate(-50%, calc(-100% - 22px)) scale(${1 / view.s})`,
                transformOrigin: '50% 100%',
              }}
            >
              {t.label}
            </button>
          ))}

          {/* Точки съёмки панорам */}
          {viewpoints.map((p) => (
            <div key={p.id} className="absolute z-[9]"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `scale(${1 / view.s})` }}>
              <button type="button" onClick={() => onOpenPano?.(p)} aria-label={`Панорама: ${p.name}`} title={`Панорама: ${p.name}`}
                className={`group absolute left-0 top-0 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow ring-2 ring-ink/70 transition hover:scale-110 hover:bg-signal ${compact ? 'size-5' : 'size-7'}`}>
                <svg viewBox="0 0 24 24" className={compact ? 'size-3' : 'size-4'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                </svg>
                <span className="pointer-events-none absolute top-full mt-1 hidden whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block group-focus-visible:block">
                  {p.name}
                </span>
              </button>
            </div>
          ))}

          {/* Точки интереса */}
          {nodes.map((n) => {
            const selected = n.id === selectedId
            const isStart = n.id === routeStartId
            const isEnd = n.id === routeEndId
            const onRoute = routeIds.has(n.id)
            const tone = selected || isEnd
              ? 'bg-signal text-ink ring-ink'
              : isStart
                ? 'bg-white text-ink ring-ink'
                : onRoute
                  ? 'bg-ink text-signal ring-signal'
                  : 'bg-ink text-white ring-white'
            return (
              <div
                key={n.id}
                className="absolute z-10"
                style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, transform: `scale(${1 / view.s})` }}
              >
                {isEnd && <span className="dest-pulse pointer-events-none absolute left-0 top-0 size-12 rounded-full bg-signal" />}
                <button
                  type="button"
                  onClick={() => onSelect(n.id)}
                  aria-label={n.name}
                  aria-pressed={selected}
                  className={`group absolute left-0 top-0 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-[2.5px] shadow-md transition-transform duration-150 hover:scale-110 ${tone} ${selected ? (compact ? 'size-8' : 'size-11') : (compact ? 'size-6 ring-2' : 'size-9')}`}
                >
                  <PoiIcon node={n} className={selected ? (compact ? 'size-5' : 'size-6') : (compact ? 'size-3.5' : 'size-[18px]')} />
                  <span className={`pointer-events-none absolute top-full mt-1.5 whitespace-nowrap rounded bg-white/95 px-1.5 py-0.5 text-xs font-semibold text-ink shadow-sm ${selected || ((isStart || isEnd) && !compact) ? 'block' : 'hidden group-hover:block group-focus-visible:block'}`}>
                    {n.name}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Масштаб */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-line">
        <button type="button" aria-label="Приблизить" className="grid size-10 place-items-center hover:bg-plaster"
          onClick={() => zoomAt(1.4, stageW / 2, stageH / 2)}><Icon d={ICONS.plus} /></button>
        <button type="button" aria-label="Отдалить" className="grid size-10 place-items-center border-t border-line hover:bg-plaster"
          onClick={() => zoomAt(1 / 1.4, stageW / 2, stageH / 2)}><Icon d={ICONS.minus} /></button>
        <button type="button" aria-label="Показать весь этаж" className="grid size-10 place-items-center border-t border-line hover:bg-plaster"
          onClick={() => setView({ s: 1, x: 0, y: 0 })}><Icon d={ICONS.fit} /></button>
      </div>
    </div>
  )
}
