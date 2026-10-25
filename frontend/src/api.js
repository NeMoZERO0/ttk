// Клиент публичного API бэкенда (app/routers/public.py).
// По умолчанию запросы идут на /api — Vite проксирует их на http://localhost:8000.
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message)
    this.status = status
    this.offline = offline
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new ApiError('Сервер карты не отвечает', { offline: true })
  }
  // Прокси Vite отвечает 500/502/504, когда бэкенд не запущен
  if ([502, 503, 504].includes(res.status) || (res.status === 500 && !res.headers.get('content-type')?.includes('json'))) {
    throw new ApiError('Сервер карты не отвечает', { status: res.status, offline: true })
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* пустое тело */ }
    throw new ApiError(typeof detail === 'string' && detail ? detail : `Ошибка ${res.status}`, { status: res.status })
  }
  return res.json()
}

/** Полный адрес файла (план, панорама), который бэкенд отдаёт как /files/... */
export const fileUrl = (path) => (!path ? null : /^https?:/.test(path) ? path : `${BASE}${path}`)

/** Анонимная статистика для организатора; ошибки не важны */
export function trackEvent(slug, kind, nodeId = null) {
  try {
    fetch(`${BASE}/public/maps/${encodeURIComponent(slug)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, node_id: nodeId }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* офлайн */ }
}

/** GET /public/maps — опубликованные карты */
export const listMaps = () => request('/public/maps')

/** GET /public/maps/{slug} — карта: этажи, точки, панорамы */
export const getMap = (slug) => request(`/public/maps/${encodeURIComponent(slug)}`)

/** POST /public/maps/{slug}/route — кратчайший маршрут между точками */
export const buildRoute = (slug, fromNodeId, toNodeId) =>
  request(`/public/maps/${encodeURIComponent(slug)}/route`, {
    method: 'POST',
    body: JSON.stringify({ from_node_id: fromNodeId, to_node_id: toNodeId }),
  })
