// Запросы организатора (нужен токен из /auth/login).
import { ApiError } from '../api.js'

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const KEY = 'space-map-token'

export function getToken() {
  try { return localStorage.getItem(KEY) } catch { return null }
}
export function setToken(t) {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch { /* приватный режим */ }
}

async function call(method, path, body) {
  const token = getToken()
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Сервер карты не отвечает', { offline: true })
  }
  if ([502, 503, 504].includes(res.status) || (res.status === 500 && !res.headers.get('content-type')?.includes('json'))) {
    throw new ApiError('Сервер карты не отвечает', { status: res.status, offline: true })
  }
  if (res.status === 204) return null
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* пусто */ }
    const msg = typeof detail === 'string' && detail ? detail : `Ошибка ${res.status}`
    throw new ApiError(msg, { status: res.status })
  }
  return res.json()
}

export const login = (email, password) => call('POST', '/auth/login', { email, password })
export const register = (email, password) => call('POST', '/auth/register', { email, password })
export const me = () => call('GET', '/auth/me')

export const listMaps = () => call('GET', '/maps')
export const createMap = (title, address) => call('POST', '/maps', { title, address })
export const deleteMap = (mapId) => call('DELETE', `/maps/${mapId}`)
export const publishMap = (slug) => call('POST', `/public/maps/${encodeURIComponent(slug)}/publish`)

export const listFloors = (mapId) => call('GET', `/maps/${mapId}/floors`)
export const createFloor = (mapId, name, level) => call('POST', `/maps/${mapId}/floors`, { name, level })

export const getBuilding = (mapId) => call('GET', `/maps/${mapId}/building`)
export const putBuilding = (mapId, b) => call('PUT', `/maps/${mapId}/building`, b)

export const listRooms = (mapId) => call('GET', `/maps/${mapId}/rooms`)
export const createRoom = (mapId, room) => call('POST', `/maps/${mapId}/rooms`, room)
export const patchRoom = (mapId, id, patch) => call('PATCH', `/maps/${mapId}/rooms/${id}`, patch)
export const deleteRoom = (mapId, id) => call('DELETE', `/maps/${mapId}/rooms/${id}`)

// --- точки ---
export const listNodes = (mapId) => call('GET', `/maps/${mapId}/nodes`)
export const createNode = (mapId, node) => call('POST', `/maps/${mapId}/nodes`, node)
export const patchNode = (mapId, id, node) => call('PATCH', `/maps/${mapId}/nodes/${id}`, node)
export const deleteNode = (mapId, id) => call('DELETE', `/maps/${mapId}/nodes/${id}`)

// --- панорамы ---
export const listPanos = (mapId) => call('GET', `/maps/${mapId}/panoramas`)
export const patchPano = (mapId, id, patch) => call('PATCH', `/maps/${mapId}/panoramas/${id}`, patch)
export const deletePano = (mapId, id) => call('DELETE', `/maps/${mapId}/panoramas/${id}`)
export const addHotspot = (mapId, panoId, h) => call('POST', `/maps/${mapId}/panoramas/${panoId}/hotspots`, h)
export const deleteHotspot = (mapId, panoId, id) => call('DELETE', `/maps/${mapId}/panoramas/${panoId}/hotspots/${id}`)

// --- статистика ---
export const getStats = (mapId) => call('GET', `/maps/${mapId}/stats`)

/** Загрузка файла (multipart) с прогрессом */
export function uploadForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total) }
    xhr.onload = () => {
      let body = null
      try { body = JSON.parse(xhr.responseText) } catch { /* не JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new ApiError(typeof body?.detail === 'string' ? body.detail : `Ошибка ${xhr.status}`, { status: xhr.status }))
    }
    xhr.onerror = () => reject(new ApiError('Сервер карты не отвечает', { offline: true }))
    xhr.send(form)
  })
}

export const uploadPano = (mapId, form, onProgress) => uploadForm(`/maps/${mapId}/panoramas/upload`, form, onProgress)
export const uploadPlan = (mapId, floorId, form, onProgress) => uploadForm(`/maps/${mapId}/floors/${floorId}/plan/upload`, form, onProgress)
export const deletePlan = (mapId, floorId) => call('DELETE', `/maps/${mapId}/floors/${floorId}/plan`)
