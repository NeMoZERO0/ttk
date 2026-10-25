// Переключатель этажей в виде панели кнопок лифта: верхний этаж — сверху.
export default function FloorSwitcher({ floors, currentId, onChange, routeFloorIds }) {
  const ordered = [...floors].sort((a, b) => b.level - a.level)
  return (
    <nav aria-label="Этажи" className="flex flex-col items-center gap-2 rounded-2xl bg-ink p-2 shadow-lg">
      {ordered.map((f) => {
        const active = f.id === currentId
        const onRoute = routeFloorIds?.has(f.id)
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-current={active ? 'true' : undefined}
            title={f.name}
            className={`relative grid size-11 place-items-center rounded-full text-lg font-extrabold tabular-nums transition ${
              active
                ? 'bg-signal text-ink shadow-[0_0_0_3px_#1C2430,0_0_0_5px_#FFC627]'
                : 'bg-[#2b3646] text-white/85 hover:bg-[#384457] hover:text-white'
            }`}
          >
            {f.level}
            {onRoute && !active && (
              <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-signal ring-2 ring-ink" aria-label="на этом этаже есть часть маршрута" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
