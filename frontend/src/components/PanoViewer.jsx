import { useEffect, useMemo, useRef, useState } from 'react'
import PanoCanvas from './PanoCanvas.jsx'
import { fileUrl } from '../api.js'
import { hotspotsFor, wrap180 } from '../lib/pano.js'
import { Icon, ICONS, PoiIcon, categoryLabel } from '../icons.jsx'
import { fmt } from '../lib/plan.js'

const CAMERA = <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>
const ARROW = <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>
const INFO = <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.01" /></>

/**
 * Полноэкранный просмотр панорамы.
 *  startPano — с какой панорамы начать; tour — [{pano, nextYaw}] для прохождения маршрута
 *  data — { nodes, panoramas, building, floors }
 *  destinationId — точка назначения маршрута (подсвечивается)
 */
export default function PanoViewer({ startPano, tour, startIndex = 0, data, destinationId, onClose, onRouteTo, onTrack }) {
  const [index, setIndex] = useState(startIndex)
  const [pano, setPano] = useState(tour ? tour[startIndex].pano : startPano)
  const [card, setCard] = useState(null)
  const [hint, setHint] = useState(true)
  const canvasRef = useRef(null)
  const closeRef = useRef(null)
  const floorsById = useMemo(() => Object.fromEntries((data.floors ?? []).map((f) => [f.id, f])), [data.floors])

  const initialYaw = useMemo(() => (tour ? tour[startIndex].nextYaw : startPano?.yaw ?? 0), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { onTrack?.(pano) }, [pano?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setHint(false), 3500); return () => clearTimeout(t) }, [])

  const goTo = (next, yaw) => {
    // Сохраняем направление «по миру»: куда смотрели — туда смотрим и в новой панораме
    const v = canvasRef.current?.getView()
    const keep = v ? wrap180(v.yaw - pano.yaw + next.yaw) : next.yaw
    setCard(null)
    setPano(next)
    requestAnimationFrame(() => canvasRef.current?.lookAt(yaw ?? keep, 0, false))
  }

  const step = (delta) => {
    const i = Math.min(Math.max(index + delta, 0), tour.length - 1)
    if (i === index) return
    setIndex(i)
    const target = tour[i]
    setCard(null)
    setPano(target.pano)
    requestAnimationFrame(() => {
      canvasRef.current?.lookAt(wrap180(target.nextYaw - 25), 0, false)
      canvasRef.current?.lookAt(target.nextYaw, 0, true)
    })
  }

  const spots = useMemo(() => {
    const list = hotspotsFor(pano, data)
    const next = tour?.[index + 1]?.pano
    return list.map((h) => {
      if (h.kind === 'poi') {
        const isDest = h.node.id === destinationId
        return {
          ...h,
          render: () => (
            <button type="button" onClick={() => setCard({ kind: 'poi', node: h.node, dist: h.dist })}
              className={`-translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-[13px] font-semibold shadow-lg ring-2 transition hover:scale-105 ${
                isDest ? 'bg-signal text-ink ring-ink' : 'bg-white/95 text-ink ring-white/60'
              }`}>
              <span className={`grid size-7 place-items-center rounded-full ${isDest ? 'bg-ink text-signal' : 'bg-ink text-white'}`}>
                <PoiIcon node={h.node} className="size-4" />
              </span>
              {h.node.name}
              <span className="font-normal text-ink-soft">{fmt(h.dist, 0)} м</span>
            </button>
          ),
        }
      }
      if (h.kind === 'pano') {
        const isNext = next && h.pano.id === next.id
        return {
          ...h,
          render: () => (
            <button type="button" onClick={() => (tour && isNext ? step(1) : goTo(h.pano))}
              aria-label={`Перейти: ${h.pano.name}`}
              className="group -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <span className={`grid size-12 place-items-center rounded-full shadow-xl ring-[3px] transition group-hover:scale-110 ${
                isNext ? 'bg-signal text-ink ring-ink' : 'bg-ink/80 text-white ring-white/80'
              }`}>
                <Icon d={ARROW} className="size-6" />
              </span>
              <span className="whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-xs font-semibold text-white">
                {h.pano.name}, {fmt(h.dist, 0)} м
              </span>
            </button>
          ),
        }
      }
      return {
        ...h,
        render: () => (
          <button type="button" onClick={() => setCard({ kind: 'info', hotspot: h.hotspot })}
            className="-translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/90 py-1 pl-1 pr-3 text-[13px] font-semibold text-white shadow-lg ring-2 ring-signal">
            <span className="grid size-7 place-items-center rounded-full bg-signal text-ink"><Icon d={INFO} className="size-4" /></span>
            {h.hotspot.title}
          </button>
        ),
      }
    })
  }, [pano, data, tour, index, destinationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const floor = floorsById[pano.floor_id]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#11161d] text-white" role="dialog" aria-modal="true" aria-label={`Панорама: ${pano.name}`}>
      <div className="relative min-h-0 flex-1">
        <PanoCanvas
          ref={canvasRef}
          previewUrl={fileUrl(pano.preview_url)}
          url={fileUrl(pano.url)}
          initialYaw={initialYaw}
          hotspots={spots}
          onViewClick={() => setCard(null)}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/55 to-transparent p-3 sm:p-4">
          <div className="pointer-events-auto min-w-0">
            <p className="flex items-center gap-2 text-lg font-extrabold leading-tight">
              <Icon d={CAMERA} className="size-5 shrink-0 text-signal" />
              <span className="truncate">{pano.name}</span>
            </p>
            <p className="text-sm text-white/70">{floor?.name}{tour ? `, шаг ${index + 1} из ${tour.length}` : ''}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-ink shadow-lg hover:bg-signal">
            <Icon d={ICONS.close} className="size-4" /> Закрыть
          </button>
        </div>

        {hint && (
          <p className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold">
            Потяните, чтобы осмотреться
          </p>
        )}

        {card && (
          <div className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-sm rounded-2xl bg-white p-4 text-ink shadow-2xl sm:left-4 sm:right-auto sm:mx-0">
            {card.kind === 'poi' ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-signal"><PoiIcon node={card.node} className="size-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold leading-tight">{card.node.name}</p>
                    <p className="text-sm text-ink-soft">{categoryLabel(card.node)}, около {fmt(card.dist, 0)} м отсюда</p>
                  </div>
                  <button type="button" onClick={() => setCard(null)} aria-label="Закрыть" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-plaster">
                    <Icon d={ICONS.close} className="size-4" />
                  </button>
                </div>
                {card.node.description && <p className="mt-2 text-[15px] leading-relaxed text-ink/85">{card.node.description}</p>}
                {onRouteTo && (
                  <button type="button" onClick={() => onRouteTo(card.node)}
                    className="mt-3 w-full rounded-xl bg-signal px-3 py-2.5 text-sm font-bold text-ink ring-2 ring-ink hover:bg-[#ffd04d]">
                    Построить маршрут сюда
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-extrabold leading-tight">{card.hotspot.title}</p>
                  <button type="button" onClick={() => setCard(null)} aria-label="Закрыть" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-plaster">
                    <Icon d={ICONS.close} className="size-4" />
                  </button>
                </div>
                {card.hotspot.description && <p className="mt-1 text-[15px] leading-relaxed text-ink/85">{card.hotspot.description}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {tour && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-[#11161d] p-3">
          <button type="button" onClick={() => step(-1)} disabled={index === 0}
            className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20 disabled:opacity-30">
            Назад
          </button>
          <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
            {tour.map((t, i) => (
              <span key={t.pano.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-signal' : i < index ? 'w-1.5 bg-signal/60' : 'w-1.5 bg-white/30'}`} />
            ))}
          </div>
          {index < tour.length - 1 ? (
            <button type="button" onClick={() => step(1)}
              className="rounded-xl bg-signal px-5 py-3 text-sm font-extrabold text-ink hover:bg-[#ffd04d]">
              Дальше
            </button>
          ) : (
            <button type="button" onClick={onClose} className="rounded-xl bg-signal px-5 py-3 text-sm font-extrabold text-ink">
              К карте
            </button>
          )}
        </div>
      )}
    </div>
  )
}
