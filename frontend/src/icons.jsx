// Пиктограммы категорий точек — в духе навигационных табличек.
const P = {
  entrance: <><path d="M10 4h8v16h-8" /><path d="M3 12h10" /><path d="M10 8l4 4-4 4" /></>,
  service: <><path d="M12 7a2 2 0 1 1 2 2c-1 0-2 .7-2 2" /><path d="M12 11l-9 6h18z" /></>,
  food: <><path d="M7 3v8a2 2 0 0 0 2 2v8" /><path d="M11 3v8a2 2 0 0 1-2 2" /><path d="M17 21V3c-2 1-3 4-3 8h3" /></>,
  wc: <><circle cx="8" cy="5" r="1.6" /><path d="M6 9h4v6H9v6H7v-6H6z" /><circle cx="16" cy="5" r="1.6" /><path d="M16 9l-3 7h6z" /><path d="M15 16v5M17 16v5" /></>,
  stairs: <><path d="M3 20h5v-5h5v-5h5V5h3" /></>,
  elevator: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 10l3-3 3 3" /><path d="M9 14l3 3 3-3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.01" /></>,
  room: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20l4-4 4 4" /></>,
  medical: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></>,
  library: <><path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1z" /><path d="M20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z" /></>,
  cowork: <><rect x="5" y="5" width="14" height="10" rx="1" /><path d="M2 19h20" /></>,
  office: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3" /><path d="M3 12h18" /></>,
  meeting: <><path d="M4 5h11v8H8l-4 3z" /><path d="M15 9h5v8l-3-2h-6v-2" /></>,
  stand: <><rect x="4" y="4" width="16" height="10" rx="1" /><path d="M8 20h8M12 14v6" /></>,
  hall: <><path d="M3 10l9-6 9 6" /><path d="M5 10v9M19 10v9M9 10v9M15 10v9M3 20h18" /></>,
  wifi: <><path d="M2 9a15 15 0 0 1 20 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" /><path d="M9 16a5 5 0 0 1 6 0" /><path d="M12 19.5v.01" /></>,
  desk: <><path d="M3 11h18v3H3z" /><path d="M5 14v6M19 14v6" /><circle cx="12" cy="6" r="2.5" /></>,
  outdoor: <><path d="M12 3l5 7h-3l4 6H6l4-6H7z" /><path d="M12 16v5" /></>,
  parking: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M10 17V7h3a3 3 0 0 1 0 6h-3" /></>,
  poi: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
}

export const CATEGORY_LABELS = {
  entrance: 'Вход',
  service: 'Сервис',
  food: 'Еда',
  wc: 'Туалет',
  stairs: 'Лестница',
  elevator: 'Лифт',
  info: 'Справочная',
  room: 'Аудитория',
  medical: 'Медпункт',
  library: 'Библиотека',
  cowork: 'Коворкинг',
  office: 'Офис',
  meeting: 'Переговорная',
  stand: 'Стенд',
  hall: 'Зал',
  wifi: 'Wi-Fi',
  desk: 'Стойка обслуживания',
  outdoor: 'Территория',
  parking: 'Парковка',
  poi: 'Место',
}

export function iconKey(node) {
  if (node.category && P[node.category]) return node.category
  if (P[node.type]) return node.type
  return 'poi'
}

export function categoryLabel(node) {
  return CATEGORY_LABELS[iconKey(node)] ?? (node.category || 'Точка')
}

export function PoiIcon({ node, name, className = 'size-5' }) {
  const key = name ?? iconKey(node)
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[key] ?? P.poi}
    </svg>
  )
}

export function Icon({ d, className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  )
}

export const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  swap: <><path d="M7 4v16M3 8l4-4 4 4" /><path d="M17 20V4M13 16l4 4 4-4" /></>,
  route: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  fit: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  from: <><circle cx="12" cy="12" r="5" /></>,
  to: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /></>,
}
