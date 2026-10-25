import React from 'react'

export default function DoorSettings({
  door,
  building,
  onChange,
  onDelete,
  onClose,
}) {
  if (!door) return null

  const meta = door.meta || {}
  const doorType = meta.door_type || 'single'
  const widthM = meta.width_m || 1.0
  const angle = meta.angle || 0
  const swing = meta.swing || 'left'

  const updateMeta = (patch) => {
    onChange(door.id, {
      meta: {
        ...meta,
        ...patch,
      },
    })
  }

  const rotate90 = () => {
    const nextAngle = (angle + 90) % 360
    updateMeta({ angle: nextAngle })
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl ring-1 ring-[#E3E7EC] shadow-lg animate-in fade-in duration-150">
      <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#1C2430]" />
          <h3 className="text-sm font-extrabold text-[#1C2430]">
            Параметры двери
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-bold text-[#7A8594] hover:text-[#1C2430] px-2 py-0.5 rounded-lg hover:bg-[#F6F7F9]"
        >
          Готово
        </button>
      </div>

      {/* Тип двери */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-[#7A8594]">Тип конструкции</label>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F6F7F9] rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => updateMeta({ door_type: 'single' })}
            className={`py-1.5 rounded-lg transition ${
              doorType === 'single'
                ? 'bg-white text-[#1C2430] shadow-sm font-bold'
                : 'text-[#7A8594] hover:text-[#1C2430]'
            }`}
          >
            1 створка
          </button>
          <button
            type="button"
            onClick={() => updateMeta({ door_type: 'double' })}
            className={`py-1.5 rounded-lg transition ${
              doorType === 'double'
                ? 'bg-white text-[#1C2430] shadow-sm font-bold'
                : 'text-[#7A8594] hover:text-[#1C2430]'
            }`}
          >
            2 створки
          </button>
          <button
            type="button"
            onClick={() => updateMeta({ door_type: 'opening' })}
            className={`py-1.5 rounded-lg transition ${
              doorType === 'opening'
                ? 'bg-white text-[#1C2430] shadow-sm font-bold'
                : 'text-[#7A8594] hover:text-[#1C2430]'
            }`}
          >
            Проём
          </button>
        </div>
      </div>

      {/* Ширина двери */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-[#7A8594]">
          Ширина проёма: <b className="text-[#1C2430]">{widthM} м</b>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[0.8, 0.9, 1.0, 1.2, 1.5, 2.0].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => updateMeta({ width_m: w })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                Math.abs(widthM - w) < 0.05
                  ? 'border-[#1C2430] bg-[#1C2430] text-white'
                  : 'border-[#E3E7EC] bg-white text-[#7A8594] hover:border-[#1C2430]'
              }`}
            >
              {w} м
            </button>
          ))}
        </div>
      </div>

      {/* Ориентация и открывание */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={rotate90}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#1C2430] bg-[#F6F7F9] hover:bg-[#E3E7EC] rounded-xl transition"
        >
          <svg className="size-3.5 text-[#1C2430]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Поворот {angle}°</span>
        </button>

        {doorType !== 'opening' ? (
          <button
            type="button"
            onClick={() => updateMeta({ swing: swing === 'left' ? 'right' : 'left' })}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#1C2430] bg-[#F6F7F9] hover:bg-[#E3E7EC] rounded-xl transition"
          >
            <span>Петли: {swing === 'left' ? 'Слева' : 'Справа'}</span>
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* Удалить дверь */}
      <button
        type="button"
        onClick={() => onDelete(door.id)}
        className="w-full mt-1 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition"
      >
        Удалить дверь
      </button>
    </div>
  )
}
