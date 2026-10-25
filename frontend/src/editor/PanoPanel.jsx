import { useRef, useState } from 'react'
import { fileUrl } from '../api.js'
import CaptureWizard from './CaptureWizard.jsx'
import * as api from './editorApi.js'

const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4z M12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7'

/** Добавление панорамы в выбранную точку плана: снять на телефон или загрузить готовую */
export function AddPanoDialog({ mapId, floorId, spot, onCreated, onCancel }) {
  const [name, setName] = useState('Панорама')
  const [mode, setMode] = useState(null) // capture | upload
  const [hfov, setHfov] = useState('360')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const upload = async (blob, fov = 360, filename = 'panorama.jpg') => {
    setBusy('Загружаем панораму…'); setError(null)
    const form = new FormData()
    form.append('file', blob, filename)
    form.append('floor_id', floorId)
    form.append('x', String(spot.x))
    form.append('y', String(spot.y))
    form.append('name', name.trim() || 'Панорама')
    form.append('hfov', String(fov))
    try {
      const p = await api.uploadPano(mapId, form, (k) => setBusy(`Загружаем панораму… ${Math.round(k * 100)}%`))
      onCreated(p)
    } catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/50 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="add-pano-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-plaster p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="add-pano-title" className="text-xl font-extrabold">Новая панорама</h2>
          {!busy && <button type="button" onClick={onCancel} className="text-sm font-semibold text-ink-soft hover:text-ink">Отмена</button>}
        </div>

        <label className="mb-4 flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Название точки съёмки</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-lg bg-white px-3 py-2 text-[15px] font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-ink" />
        </label>

        {busy ? (
          <p role="status" className="animate-pulse py-6 text-center font-semibold">{busy}</p>
        ) : mode === 'capture' ? (
          <CaptureWizard onDone={(blob) => upload(blob, 360)} onCancel={() => setMode(null)} />
        ) : mode === 'upload' ? (
          <div className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm text-ink-soft">Что за снимок</legend>
              {[['360', 'Сферическая панорама 360° (2:1)', 'С 360°-камеры или из приложений панорам'],
                ['180', 'Режим «Панорама» телефона', 'Длинная полоса, примерно на пол-оборота'],
                ['360s', 'Полоса на полный оборот', 'Если в режиме «Панорама» вы обошли круг целиком']].map(([v, l, h]) => (
                <label key={v} className={`flex cursor-pointer flex-col rounded-xl px-3 py-2 ring-1 ${hfov === v ? 'bg-white ring-2 ring-ink' : 'ring-line hover:bg-white'}`}>
                  <input type="radio" name="hfov" className="sr-only" checked={hfov === v} onChange={() => setHfov(v)} />
                  <span className="font-bold">{l}</span>
                  <span className="text-xs text-ink-soft">{h}</span>
                </label>
              ))}
            </fieldset>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-signal px-4 py-3 font-extrabold text-ink ring-2 ring-ink">Выбрать файл</button>
            <button type="button" onClick={() => setMode(null)} className="text-sm font-semibold text-ink-soft hover:text-ink">Назад</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) upload(f, hfov === '180' ? 180 : 360, f.name)
              }} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[
              ['capture', 'Снять на телефон', 'Пошаговая съёмка: 8–12 кадров с поворотом на месте, склейка прямо на устройстве'],
              ['upload', 'Загрузить готовую', 'Панорама 360° или снимок в режиме «Панорама»'],
            ].map(([k, t, d]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className="flex flex-col rounded-xl bg-white px-4 py-3 text-left ring-1 ring-line hover:ring-2 hover:ring-ink">
                <span className="font-extrabold">{t}</span>
                <span className="text-sm text-ink-soft">{d}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-sm font-medium text-alert">{error}</p>}
      </div>
    </div>
  )
}

/** Список панорам этажа и форма выбранной */
export default function PanoPanel({ panos, selected, onSelect, onAdd, placing, onRename, onOpenSetup, onDelete }) {
  const [confirm, setConfirm] = useState(false)
  const [name, setName] = useState(selected?.name ?? '')
  const [lastId, setLastId] = useState(null)
  if ((selected?.id ?? null) !== lastId) { setLastId(selected?.id ?? null); setName(selected?.name ?? ''); setConfirm(false) }

  if (selected) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="pano-title">
        <div className="flex items-center justify-between">
          <h2 id="pano-title" className="text-lg font-extrabold">Панорама</h2>
          <button type="button" onClick={() => onSelect(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-white hover:text-ink">Готово</button>
        </div>
        <img src={fileUrl(selected.preview_url)} alt="" className="aspect-[2/1] w-full rounded-lg object-cover ring-1 ring-line" />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Название</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== selected.name && onRename(name.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="rounded-lg bg-white px-3 py-2 text-[15px] font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-ink" />
        </label>
        <button type="button" onClick={onOpenSetup}
          className="rounded-xl bg-ink px-4 py-3 font-bold text-white hover:bg-[#2b3646]">Открыть: совместить с планом и метки</button>
        <p className="text-sm text-ink-soft">
          Меток на панораме: {selected.hotspots?.length ?? 0}. Жёлтый сектор на плане показывает, куда смотрит панорама при открытии.
          Перетащите значок камеры, если точка съёмки стоит не там.
        </p>
        {confirm ? (
          <div className="flex items-center gap-2 rounded-xl bg-alert/10 p-2">
            <span className="flex-1 pl-1 text-sm font-medium text-alert">Удалить панораму?</span>
            <button type="button" onClick={onDelete} className="rounded-lg bg-alert px-3 py-1.5 text-sm font-bold text-white">Удалить</button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white">Отмена</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="self-start rounded-lg px-2 py-1 text-sm font-semibold text-alert hover:bg-alert/10">Удалить панораму</button>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="panos-title">
      <button type="button" onClick={onAdd}
        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[17px] font-extrabold ring-2 ring-ink transition ${
          placing ? 'bg-ink text-white' : 'bg-signal text-ink shadow-[0_2px_0_#1C2430] hover:bg-[#ffd04d]'}`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d={CAMERA} /></svg>
        {placing ? 'Нажмите на плане, где стоит камера' : 'Добавить панораму'}
      </button>
      <h2 id="panos-title" className="text-sm font-semibold text-ink-soft">Панорамы этажа: {panos.length}</h2>
      {panos.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-3 text-[15px] text-ink-soft ring-1 ring-line">
          Панорам пока нет. Добавьте точку съёмки — снимите её на телефон или загрузите готовую панораму.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {panos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p.id)} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-white">
                <img src={fileUrl(p.preview_url)} alt="" loading="lazy" className="h-10 w-20 shrink-0 rounded-md object-cover ring-1 ring-line" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-xs text-ink-soft">Меток: {p.hotspots?.length ?? 0}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
