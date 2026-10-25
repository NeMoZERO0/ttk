// Сохранение карты на устройстве: файлы кладутся в тот же кэш, из которого их отдаёт service worker.
import { fileUrl } from '../api.js'

const FILES = 'space-map-files-v1'

// Кнопка имеет смысл, только когда страницей управляет service worker (собранная версия)
export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window && Boolean(navigator.serviceWorker?.controller)

export function offlineUrls(data) {
  const urls = new Set()
  for (const f of data.floors ?? []) if (f.plan_url) urls.add(fileUrl(f.plan_url))
  for (const p of data.panoramas ?? []) {
    if (p.preview_url) urls.add(fileUrl(p.preview_url))
    if (p.url) urls.add(fileUrl(p.url))
  }
  return [...urls]
}

export async function saveForOffline(data, onProgress = () => {}) {
  const urls = offlineUrls(data)
  const cache = await caches.open(FILES)
  let done = 0
  for (const u of urls) {
    if (!(await cache.match(u))) {
      const res = await fetch(u)
      if (res.ok) await cache.put(u, res)
    }
    done += 1
    onProgress(done / Math.max(1, urls.length))
  }
  try { localStorage.setItem(`offline:${data.slug}`, String(data.version ?? 1)) } catch { /* приватный режим */ }
  return urls.length
}

export function isSavedOffline(slug) {
  try { return Boolean(localStorage.getItem(`offline:${slug}`)) } catch { return false }
}
