import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from '../icons.jsx'

// Категории отдельных точек (стенды, стойки, Wi-Fi и т. п.)
export const POINT_CATEGORIES = [
  'stand', 'hall', 'entrance', 'desk', 'info', 'wifi', 'wc', 'food', 'medical', 'stairs', 'elevator',
  'room', 'meeting', 'cowork', 'library', 'office', 'service', 'parking', 'poi',
].map((k) => [k, CATEGORY_LABELS[k] ?? k])

export const nodeTypeFor = (category) => (['entrance', 'stairs', 'elevator'].includes(category) ? category : 'poi')

export default function PointForm({ point, onChange, onDelete, onClose }) {
  const [name, setName] = useState(point.name)
  const [desc, setDesc] = useState(point.description ?? '')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { setName(point.name); setDesc(point.description ?? ''); setConfirm(false) }, [point.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="point-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="point-title" className="text-lg font-extrabold">Точка на карте</h2>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-white hover:text-ink">Готово</button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Название</span>
        <input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== point.name && onChange({ name: name.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="rounded-lg bg-white px-3 py-2 text-[15px] font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-ink" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Категория</span>
        <select value={point.category ?? 'poi'} onChange={(e) => onChange({ category: e.target.value, type: nodeTypeFor(e.target.value) })}
          className="rounded-lg bg-white px-3 py-2 text-[15px] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink">
          {POINT_CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Описание для посетителей</span>
        <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (point.description ?? '') && onChange({ description: desc || null })}
          className="resize-y rounded-lg bg-white px-3 py-2 text-[15px] leading-relaxed outline-none ring-1 ring-line focus:ring-2 focus:ring-ink" />
      </label>
      <p className="text-sm text-ink-soft">Перетащите точку на плане, чтобы переместить. Она сама подключится к ближайшему коридору — к ней можно строить маршрут.</p>
      {confirm ? (
        <div className="flex items-center gap-2 rounded-xl bg-alert/10 p-2">
          <span className="flex-1 pl-1 text-sm font-medium text-alert">Удалить «{point.name}»?</span>
          <button type="button" onClick={onDelete} className="rounded-lg bg-alert px-3 py-1.5 text-sm font-bold text-white">Удалить</button>
          <button type="button" onClick={() => setConfirm(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white">Отмена</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="self-start rounded-lg px-2 py-1 text-sm font-semibold text-alert hover:bg-alert/10">Удалить точку</button>
      )}
    </section>
  )
}
