import { Icon, ICONS } from '../icons.jsx'
import { describeRoute, formatLength } from '../lib/route.js'

function PointSelect({ id, label, value, onChange, floors, pois, marker }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 rounded-xl bg-white py-2 pl-3 pr-12 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
      {marker}
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 flex-1 appearance-none bg-transparent py-1.5 text-[15px] font-medium outline-none"
      >
        <option value="">{label}</option>
        {floors.map((f) => (
          <optgroup key={f.id} label={f.name}>
            {pois.filter((p) => p.floor_id === f.id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

export default function RoutePanel({
  floors, pois, fromId, toId, setFromId, setToId,
  onBuild, onReset, onClose, loading, error, route, floorsById, onGoFloor,
  tourLength = 0, onStartTour,
}) {
  const canBuild = fromId && toId && fromId !== toId && !loading
  const steps = route ? describeRoute(route, floorsById) : []
  const len = route ? formatLength(route.length) : null

  return (
    <section aria-labelledby="route-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="route-title" className="text-lg font-extrabold">Маршрут</h2>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-white hover:text-ink">
          Закрыть
        </button>
      </div>

      <form
        className="relative flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (canBuild) onBuild() }}
      >
        <PointSelect id="route-from" label="Откуда" value={fromId} onChange={setFromId} floors={floors} pois={pois}
          marker={<span className="size-3.5 shrink-0 rounded-full border-[3px] border-ink bg-white" />} />
        <PointSelect id="route-to" label="Куда" value={toId} onChange={setToId} floors={floors} pois={pois}
          marker={<span className="size-3.5 shrink-0 rounded-full bg-signal ring-2 ring-ink" />} />
        <button
          type="button"
          onClick={() => { setFromId(toId); setToId(fromId) }}
          aria-label="Поменять местами"
          className="absolute right-2 top-[34px] grid size-9 place-items-center rounded-full bg-ink text-white shadow-md hover:bg-[#2b3646]"
        >
          <Icon d={ICONS.swap} className="size-4" />
        </button>

        {fromId && toId && fromId === toId && (
          <p className="text-sm text-alert">Начало и конец совпадают — выберите другую точку.</p>
        )}

        <button
          type="submit"
          disabled={!canBuild}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-bold text-white transition hover:bg-[#2b3646] disabled:cursor-not-allowed disabled:bg-ink/30"
        >
          <Icon d={ICONS.route} />
          {loading ? 'Строим…' : 'Построить маршрут'}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-alert/10 px-3 py-2 text-sm font-medium text-alert">{error}</p>
      )}

      {route && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <div className="flex items-baseline gap-4">
            <p className="text-3xl font-extrabold tabular-nums tracking-[-0.02em]">{len.minutes}</p>
            <p className="text-ink-soft">пешком, около {len.meters}</p>
          </div>
          <ol className="mt-4 flex flex-col">
            {steps.map((s, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-[3px] bg-signal" aria-hidden="true" />}
                <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${
                  s.kind === 'end' ? 'bg-signal text-ink ring-2 ring-ink' : 'bg-ink text-white'
                }`}>{i + 1}</span>
                <button
                  type="button"
                  onClick={() => onGoFloor(s.floorId)}
                  className="pt-0.5 text-left text-[15px] leading-snug hover:underline"
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ol>
          {tourLength > 0 && (
            <button type="button" onClick={onStartTour}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-3 text-sm font-bold text-white hover:bg-[#2b3646]">
              <svg viewBox="0 0 24 24" className="size-5 text-signal" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              Пройти маршрут в панорамах ({tourLength})
            </button>
          )}
          <button type="button" onClick={onReset}
            className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft ring-1 ring-line hover:bg-plaster hover:text-ink">
            Сбросить маршрут
          </button>
        </div>
      )}
    </section>
  )
}
