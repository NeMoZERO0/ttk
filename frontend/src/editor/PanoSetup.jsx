import { useMemo, useRef, useState } from 'react'
import PanoCanvas from '../components/PanoCanvas.jsx'
import { fileUrl } from '../api.js'
import { bearing, distM, hotspotsFor, wrap180 } from '../lib/pano.js'
import { Icon, ICONS, PoiIcon } from '../icons.jsx'
import * as api from './editorApi.js'

/**
 * Настройка панорамы: совмещение с планом и метки.
 * data — { nodes, panoramas, building } для автоматических меток мест.
 */
export default function PanoSetup({ mapId, pano, data, onChange, onClose }) {
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('view') // view | place
  const [draft, setDraft] = useState(null) // {yaw, pitch}
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  // Ориентиры для совмещения: места этажа, ближайшие к точке съёмки
  const refs = useMemo(() => (data.nodes ?? [])
    .filter((n) => n.floor_id === pano.floor_id && n.type !== 'corridor' && n.type !== 'viewpoint')
    .map((n) => ({ n, d: distM(pano, n, data.building) }))
    .filter(({ d }) => d > 1.5)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12), [data, pano])
  const [refId, setRefId] = useState(refs[0]?.n.id ?? '')

  const spots = useMemo(() => {
    const list = hotspotsFor(pano, data)
    const withDraft = draft ? [...list, { key: 'draft', kind: 'draft', yaw: draft.yaw, pitch: draft.pitch }] : list
    return withDraft.map((h) => ({
      ...h,
      render: () => h.kind === 'draft' ? (
        <span className="block size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-signal ring-4 ring-ink" />
      ) : h.kind === 'poi' ? (
        <span className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white/95 py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ink shadow">
          <span className="grid size-5 place-items-center rounded-full bg-ink text-white"><PoiIcon node={h.node} className="size-3" /></span>{h.node.name}
        </span>
      ) : h.kind === 'pano' ? (
        <span className="block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-xs font-semibold text-white">↑ {h.pano.name}</span>
      ) : (
        <span className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-ink py-0.5 pl-0.5 pr-2 text-xs font-semibold text-white ring-2 ring-signal">
          <span className="grid size-5 place-items-center rounded-full bg-signal text-[11px] font-black text-ink">i</span>{h.hotspot.title}
        </span>
      ),
    }))
  }, [pano, data, draft])

  const run = async (fn, okMsg) => {
    setBusy(true); setError(null); setMsg(null)
    try { const p = await fn(); onChange(p); if (okMsg) setMsg(okMsg); return true } catch (e) { setError(e.message); return false } finally { setBusy(false) }
  }

  const align = () => {
    const ref = refs.find((r) => r.n.id === refId)?.n
    if (!ref) return
    const v = canvasRef.current.getView()
    // pano.yaw — куда смотреть, чтобы видеть «вверх по плану»
    const yaw = wrap180(v.yaw - bearing(pano, ref, data.building))
    run(() => api.patchPano(mapId, pano.id, { yaw }), `Панорама совмещена с планом по ориентиру «${ref.name}»`)
  }

  const saveHotspot = (e) => {
    e.preventDefault()
    if (!draft || !title.trim()) return
    run(() => api.addHotspot(mapId, pano.id, { yaw: wrap180(draft.yaw), pitch: draft.pitch, title: title.trim(), description: desc.trim() || null }), 'Метка добавлена')
      .then((ok) => { if (ok) { setDraft(null); setTitle(''); setDesc(''); setMode('view') } })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#11161d] lg:flex-row" role="dialog" aria-modal="true" aria-label={`Настройка панорамы: ${pano.name}`}>
      <div className="relative min-h-[50vh] flex-1">
        <PanoCanvas
          ref={canvasRef}
          previewUrl={fileUrl(pano.preview_url)}
          url={fileUrl(pano.url)}
          initialYaw={pano.yaw}
          hotspots={spots}
          onViewClick={(yaw, pitch) => { if (mode === 'place') setDraft({ yaw, pitch }) }}
          className={mode === 'place' ? 'cursor-crosshair' : ''}
        />
        {/* прицел по центру — для совмещения */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-signal/70" aria-hidden="true" />
        {mode === 'place' && (
          <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-signal px-4 py-2 text-sm font-bold text-ink shadow">
            Нажмите на панораму там, где должна быть метка
          </p>
        )}
      </div>

      <aside className="flex w-full flex-col gap-5 overflow-y-auto bg-plaster p-5 text-ink lg:w-[360px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-ink-soft">Настройка панорамы</p>
            <h2 className="text-xl font-extrabold leading-tight">{pano.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-line hover:ring-ink">
            <Icon d={ICONS.close} className="size-4" /> Готово
          </button>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="font-extrabold">1. Совместите с планом</h3>
          <p className="text-sm leading-relaxed text-ink-soft">
            Поверните панораму так, чтобы выбранное место оказалось на жёлтой линии по центру, и нажмите «Совместить». После этого метки мест встанут на свои места.
          </p>
          {refs.length ? (
            <>
              <select value={refId} onChange={(e) => setRefId(e.target.value)} aria-label="Ориентир"
                className="rounded-lg bg-white px-3 py-2 text-[15px] ring-1 ring-line">
                {refs.map(({ n, d }) => <option key={n.id} value={n.id}>{n.name} — {Math.round(d)} м</option>)}
              </select>
              <button type="button" disabled={busy} onClick={align}
                className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2b3646] disabled:opacity-40">
                Совместить
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-soft">На этаже нет мест-ориентиров. Добавьте помещения или точки на план.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-extrabold">2. Метки на панораме</h3>
          <p className="text-sm leading-relaxed text-ink-soft">
            Места с плана появляются в панораме сами. Здесь можно добавить свои метки: стойку, экран, выход — с подписью и описанием.
          </p>
          {mode === 'view' ? (
            <button type="button" onClick={() => { setMode('place'); setDraft(null) }}
              className="rounded-xl bg-signal px-4 py-2.5 text-sm font-extrabold text-ink ring-2 ring-ink">Добавить метку</button>
          ) : (
            <form onSubmit={saveHotspot} className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-line">
              {!draft && <p className="text-sm font-semibold">Нажмите на панораму, чтобы поставить метку.</p>}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Подпись, например «Регистрация»" required
                className="rounded-lg bg-plaster px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-ink" />
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Описание (необязательно)"
                className="rounded-lg bg-plaster px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-ink" />
              <div className="flex gap-2">
                <button type="submit" disabled={!draft || !title.trim() || busy}
                  className="flex-1 rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Сохранить метку</button>
                <button type="button" onClick={() => { setMode('view'); setDraft(null) }}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink">Отмена</button>
              </div>
            </form>
          )}
          {(pano.hotspots ?? []).length > 0 && (
            <ul className="flex flex-col gap-1">
              {pano.hotspots.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
                  <button type="button" onClick={() => canvasRef.current?.lookAt(h.yaw, h.pitch)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline">
                    {h.title}
                  </button>
                  <button type="button" disabled={busy} onClick={() => run(() => api.deleteHotspot(mapId, pano.id, h.id), 'Метка удалена')}
                    className="text-sm font-semibold text-alert hover:underline">Удалить</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {msg && <p role="status" className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-line">{msg}</p>}
        {error && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm font-medium text-alert">{error}</p>}
      </aside>
    </div>
  )
}
