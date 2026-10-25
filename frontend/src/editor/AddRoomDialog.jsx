import React, { useState } from 'react'
import { ROOM_CATEGORIES } from './RoomForm.jsx'

export default function AddRoomDialog({
  isOpen,
  onClose,
  onCreate,
  building,
}) {
  const [name, setName] = useState('Новое помещение')
  const [category, setCategory] = useState('room')
  const [areaM2, setAreaM2] = useState(36)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const wm = building?.width_m || 40
  const hm = building?.height_m || 25

  const sideM = Math.round(Math.sqrt(Math.max(1, areaM2)) * 10) / 10

  const handleSubmit = (e) => {
    e.preventDefault()
    const area = parseFloat(areaM2)
    if (!area || area <= 0) {
      setError('Укажите корректную площадь больше 0')
      return
    }

    // Вычисляем сторону квадрата
    const side = Math.sqrt(area)
    const wClamped = Math.min(side, wm * 0.9)
    const hClamped = Math.min(side, hm * 0.9)

    // Центрируем или размещаем на плане с округлением по 0.5 м
    const xM = Math.round(Math.max(1, (wm - wClamped) / 2) / 0.5) * 0.5
    const yM = Math.round(Math.max(1, (hm - hClamped) / 2) / 0.5) * 0.5

    const xNorm = xM / wm
    const yNorm = yM / hm
    const wNorm = wClamped / wm
    const hNorm = hClamped / hm

    // Исходные 4 вершины квадрата
    const points = [
      { x: xNorm, y: yNorm },
      { x: xNorm + wNorm, y: yNorm },
      { x: xNorm + wNorm, y: yNorm + hNorm },
      { x: xNorm, y: yNorm + hNorm },
    ]

    onCreate({
      name: name.trim() || 'Помещение',
      category,
      x: xNorm,
      y: yNorm,
      w: wNorm,
      h: hNorm,
      points,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C2430]/65 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md p-6 bg-white rounded-3xl shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center size-9 rounded-xl bg-[#1C2430] text-[#FFC627] font-bold">
              +
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1C2430]">
                Добавить помещение
              </h3>
              <p className="text-xs text-[#7A8594]">
                Задайте площадь для создания фигуры
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#7A8594] hover:text-[#1C2430] rounded-xl hover:bg-[#F6F7F9]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#7A8594]">Название</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Зал А, Аудитория 101, Стенд"
              className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#7A8594]">Тип зоны</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
            >
              {ROOM_CATEGORIES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <div className="p-3.5 bg-[#F6F7F9] rounded-2xl border border-[#E3E7EC]">
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C2430]">
                  Требуемая площадь (м²)
                </span>
                <span className="text-xs font-semibold text-[#7A8594]">
                  сторона ≈ {sideM} × {sideM} м
                </span>
              </div>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="0.5"
                  required
                  value={areaM2}
                  onChange={(e) => setAreaM2(e.target.value)}
                  className="w-full pl-3.5 pr-12 py-2.5 rounded-xl bg-white border border-[#E3E7EC] text-base font-extrabold text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none tabular-nums"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7A8594]">
                  м²
                </span>
              </div>
            </label>

            {/* Быстрые пресеты площадей */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {[16, 25, 36, 50, 100, 150].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAreaM2(preset)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    Number(areaM2) === preset
                      ? 'bg-[#1C2430] text-white'
                      : 'bg-white border border-[#E3E7EC] text-[#7A8594] hover:border-[#1C2430]'
                  }`}
                >
                  {preset} м²
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs text-[#7A8594] leading-relaxed">
              💡 Создастся исходный квадрат заданной площади. После создания вы сможете добавить вершины на стены и за них деформировать форму под нужный контур.
            </p>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-[#7A8594] hover:text-[#1C2430]"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#1C2430] text-white text-xs font-extrabold hover:bg-[#2b3646] transition shadow-sm"
            >
              Создать помещение
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
