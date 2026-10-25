import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from '../icons.jsx'
import { fmt } from '../lib/plan.js'

export const ROOM_CATEGORIES = [
  ['room', CATEGORY_LABELS.room],
  ['corridor', 'Коридор'],
  ...Object.entries(CATEGORY_LABELS).filter(([k]) => k !== 'room'),
]

/** Числовое поле: свободный ввод (можно запятую), сохранение по Enter или уходу из поля */
export function NumberField({ id, label, value, onCommit, min = 0, max, suffix, hint }) {
  const [draft, setDraft] = useState(fmt(value, 2))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setDraft(fmt(value, 2)) }, [value, focused])

  const commit = () => {
    const n = parseFloat(String(draft).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n)) { setDraft(fmt(value, 2)); return }
    const v = Math.min(Math.max(n, min), max ?? Infinity)
    if (Math.abs(v - value) > 1e-6) onCommit(v)
    setDraft(fmt(v, 2))
  }

  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="flex items-center rounded-lg bg-white ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
        <input
          id={id}
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commit() }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
          className="w-full min-w-0 bg-transparent px-3 py-2 text-[15px] font-medium tabular-nums outline-none"
        />
        {suffix && <span className="pr-3 text-sm text-ink-soft">{suffix}</span>}
      </span>
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}

export default function RoomForm({ room, building, onChange, onDelete, onClose }) {
  const wm = building.width_m
  const hm = building.height_m
  const widthM = room.w * wm
  const depthM = room.h * hm
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(room.name)
  const [desc, setDesc] = useState(room.description ?? '')

  useEffect(() => {
    setName(room.name)
    setDesc(room.description ?? '')
    setConfirmDelete(false)
  }, [room.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const geom = (patch) => onChange(room.id, patch)

  return (
    <section aria-labelledby="room-form-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="room-form-title" className="text-lg font-extrabold">Помещение</h2>
        <button type="button" onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-white hover:text-ink">
          Готово
        </button>
      </div>

      <label htmlFor="room-name" className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Название</span>
        <input
          id="room-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== room.name && onChange(room.id, { name: name.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="rounded-lg bg-white px-3 py-2 text-[15px] font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
        />
      </label>

      <label htmlFor="room-cat" className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Тип</span>
        <select
          id="room-cat"
          value={room.category}
          onChange={(e) => onChange(room.id, { category: e.target.value })}
          className="rounded-lg bg-white px-3 py-2 text-[15px] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
        >
          {ROOM_CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {room.category === 'corridor' && (
          <span className="text-xs text-ink-soft">По коридорам строятся маршруты: комнаты, которые касаются коридора, получают дверь.</span>
        )}
      </label>

      <div className="rounded-xl bg-white p-3 ring-1 ring-line">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-ink-soft">Площадь</p>
          <p className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{fmt(widthM * depthM, 1)} м²</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField id="room-w" label="Ширина" suffix="м" value={widthM} min={1} max={wm - room.x * wm}
            onCommit={(v) => geom({ w: v / wm })} />
          <NumberField id="room-h" label="Глубина" suffix="м" value={depthM} min={1} max={hm - room.y * hm}
            onCommit={(v) => geom({ h: v / hm })} />
          <div className="col-span-2">
            <NumberField id="room-area" label="Задать площадь" suffix="м²" value={widthM * depthM} min={1}
              max={widthM * (hm - room.y * hm)}
              hint="Меняется глубина, ширина остаётся прежней"
              onCommit={(v) => geom({ h: v / widthM / hm })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField id="room-x" label="От левого края" suffix="м" value={room.x * wm} max={wm - widthM}
          onCommit={(v) => geom({ x: v / wm })} />
        <NumberField id="room-y" label="От верхнего края" suffix="м" value={room.y * hm} max={hm - depthM}
          onCommit={(v) => geom({ y: v / hm })} />
      </div>

      {room.category !== 'corridor' && (
        <label htmlFor="room-desc" className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Описание для посетителей</span>
          <textarea
            id="room-desc"
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (room.description ?? '') && onChange(room.id, { description: desc || null })}
            className="resize-y rounded-lg bg-white px-3 py-2 text-[15px] leading-relaxed outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
          />
        </label>
      )}

      {confirmDelete ? (
        <div className="flex items-center gap-2 rounded-xl bg-alert/10 p-2">
          <span className="flex-1 pl-1 text-sm font-medium text-alert">Удалить «{room.name}»?</span>
          <button type="button" onClick={() => onDelete(room.id)}
            className="rounded-lg bg-alert px-3 py-1.5 text-sm font-bold text-white">Удалить</button>
          <button type="button" onClick={() => setConfirmDelete(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white">Отмена</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="self-start rounded-lg px-2 py-1 text-sm font-semibold text-alert hover:bg-alert/10">
          Удалить помещение
        </button>
      )}
    </section>
  )
}
