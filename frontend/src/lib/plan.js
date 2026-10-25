// Геометрия плана. Комнаты хранятся в долях (0..1) от габаритов здания.

export const DEFAULT_BUILDING = { width_m: 60, height_m: 42 }
export const VIEW_W = 1000

/** Размер viewBox плана: ширина фиксирована, высота — по пропорциям здания */
export function viewSize(building) {
  const b = building || DEFAULT_BUILDING
  return { W: VIEW_W, H: Math.round((VIEW_W * b.height_m) / b.width_m) }
}

// Проходимые зоны (коридор внутри, территория снаружи) — по ним строятся маршруты
export const isCorridor = (r) => r.category === 'corridor' || r.category === 'outdoor'

export function polygonArea(points, building) {
  if (!points || !Array.isArray(points) || points.length < 3) return 0
  const b = building || DEFAULT_BUILDING
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(sum / 2) * b.width_m * b.height_m
}

export function roomArea(r, b) {
  if (r.points && Array.isArray(r.points) && r.points.length >= 3) {
    return polygonArea(r.points, b)
  }
  return r.w * (b?.width_m || DEFAULT_BUILDING.width_m) * r.h * (b?.height_m || DEFAULT_BUILDING.height_m)
}

export function pointsToSvgPath(points, W, H) {
  if (!points || !Array.isArray(points) || points.length < 3) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * W} ${p.y * H}`).join(' ') + ' Z'
}

export function polygonCentroid(points) {
  if (!points || !Array.isArray(points) || points.length === 0) return { x: 0, y: 0 }
  let cx = 0, cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / points.length, y: cy / points.length }
}

export function pointsBbox(points) {
  if (!points || !Array.isArray(points) || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { x: minX, y: minY, w: Math.max(0.001, maxX - minX), h: Math.max(0.001, maxY - minY) }
}

/** Число в метрах/м² по-русски: 8,5 · 231 */
export function fmt(n, digits = 1) {
  const v = Math.round(n * 10 ** digits) / 10 ** digits
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits })
}

/** Двери: где комната соприкасается с коридором — проём по центру общей стены */
export function computeDoors(rooms, building) {
  const b = building || DEFAULT_BUILDING
  const corridors = rooms.filter(isCorridor)
  const eps = 0.006
  const doorX = 1.4 / b.width_m // ширина проёма 1,4 м
  const doorY = 1.4 / b.height_m
  const doors = []
  for (const r of rooms) {
    if (isCorridor(r)) continue
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    for (const c of corridors) {
      const ox0 = Math.max(r.x, c.x), ox1 = Math.min(r.x + r.w, c.x + c.w)
      const oy0 = Math.max(r.y, c.y), oy1 = Math.min(r.y + r.h, c.y + c.h)
      const clamp = (v, a, z) => Math.min(Math.max(v, a), z)
      if (ox1 - ox0 > doorX) {
        const x = clamp(cx, ox0 + doorX / 2, ox1 - doorX / 2)
        if (Math.abs(r.y + r.h - c.y) < eps) doors.push({ x, y: r.y + r.h, horizontal: true, size: doorX })
        else if (Math.abs(r.y - (c.y + c.h)) < eps) doors.push({ x, y: r.y, horizontal: true, size: doorX })
      }
      if (oy1 - oy0 > doorY) {
        const y = clamp(cy, oy0 + doorY / 2, oy1 - doorY / 2)
        if (Math.abs(r.x + r.w - c.x) < eps) doors.push({ x: r.x + r.w, y, horizontal: false, size: doorY })
        else if (Math.abs(r.x - (c.x + c.w)) < eps) doors.push({ x: r.x, y, horizontal: false, size: doorY })
      }
    }
  }
  return doors
}

/** Внешний контур здания на этаже */
export function bbox(rooms) {
  if (!rooms.length) return null
  const x0 = Math.min(...rooms.map((r) => r.x))
  const y0 = Math.min(...rooms.map((r) => r.y))
  const x1 = Math.max(...rooms.map((r) => r.x + r.w))
  const y1 = Math.max(...rooms.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
