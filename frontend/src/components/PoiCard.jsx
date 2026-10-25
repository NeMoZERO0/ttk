import { PoiIcon, Icon, ICONS, categoryLabel } from '../icons.jsx'
import { fmt } from '../lib/plan.js'
import { fileUrl } from '../api.js'

export default function PoiCard({ node, room, floor, onClose, onRouteFrom, onRouteTo, pano, onOpenPano }) {
  return (
    <section
      aria-label={node.name}
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-16px_rgba(28,36,48,.45)] ring-1 ring-line"
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ink text-signal">
          <PoiIcon node={node} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold leading-tight tracking-[-0.01em]">{node.name}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {categoryLabel(node)}, {floor?.name ?? 'этаж'}
            {room?.area_m2 ? `, ${fmt(room.area_m2, 0)} м²` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть"
          className="-mr-1 -mt-1 grid size-9 place-items-center rounded-full text-ink-soft hover:bg-plaster hover:text-ink">
          <Icon d={ICONS.close} />
        </button>
      </div>
      {node.description && (
        <p className="px-4 pb-4 text-[15px] leading-relaxed text-ink/85">{node.description}</p>
      )}
      {pano && (
        <button type="button" onClick={() => onOpenPano(pano)}
          className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left hover:bg-plaster">
          <img src={fileUrl(pano.preview_url)} alt="" loading="lazy"
            className="h-10 w-20 shrink-0 rounded-md object-cover ring-1 ring-line" />
          <span className="min-w-0">
            <span className="block text-sm font-bold">Смотреть панораму</span>
            <span className="block truncate text-xs text-ink-soft">Осмотреться на месте: {pano.name}</span>
          </span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
        <button type="button" onClick={onRouteFrom}
          className="flex items-center justify-center gap-2 bg-white px-3 py-3 text-sm font-semibold hover:bg-plaster">
          <Icon d={ICONS.from} className="size-4" /> Отсюда
        </button>
        <button type="button" onClick={onRouteTo}
          className="flex items-center justify-center gap-2 bg-signal px-3 py-3 text-sm font-bold text-ink hover:bg-[#ffd04d]">
          <Icon d={ICONS.to} className="size-4" /> Сюда
        </button>
      </div>
    </section>
  )
}
