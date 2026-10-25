// Геометрия панорам. Положение панорамы — точка на плане (x, y в долях здания),
// pano.yaw — направление обзора (в градусах), которое смотрит «вверх по плану».
// Направление на любой объект плана вычисляется из координат — так места
// автоматически появляются и в панорамах.
import { DEFAULT_BUILDING } from './plan.js'

const DEG = 180 / Math.PI

export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180

export function distM(a, b, building = DEFAULT_BUILDING) {
  return Math.hypot((a.x - b.x) * building.width_m, (a.y - b.y) * building.height_m)
}

/** Азимут от a к b: 0 — вверх по плану, по часовой стрелке */
export function bearing(a, b, building = DEFAULT_BUILDING) {
  const dx = (b.x - a.x) * building.width_m
  const dy = (b.y - a.y) * building.height_m
  return Math.atan2(dx, -dy) * DEG
}

/** Направление обзора внутри панорамы на точку плана */
export const yawTo = (pano, target, building) => wrap180(pano.yaw + bearing(pano, target, building))

/** Наклон взгляда на точку на расстоянии d (глаза на 1,6 м, метка — на 0,9 м) */
export const pitchTo = (d, height = 0.9) => -Math.atan2(1.6 - height, Math.max(d, 0.5)) * DEG

const HIDDEN = new Set(['corridor', 'viewpoint'])

/**
 * Метки для панорамы:
 *  - места плана того же этажа в радиусе 25 м (автоматически);
 *  - соседние панорамы в радиусе 30 м (переходы, до 6 ближайших);
 *  - ручные метки организатора.
 */
export function hotspotsFor(pano, { nodes = [], panoramas = [], building }) {
  if (pano.x == null) return manual(pano)
  const out = []
  for (const n of nodes) {
    if (n.floor_id !== pano.floor_id || HIDDEN.has(n.type)) continue
    const d = distM(pano, n, building)
    if (d < 1.2 || d > 25) continue
    out.push({ key: `poi-${n.id}`, kind: 'poi', node: n, dist: d, yaw: yawTo(pano, n, building), pitch: pitchTo(d) })
  }
  const links = panoramas
    .filter((p) => p.id !== pano.id && p.floor_id === pano.floor_id && p.x != null)
    .map((p) => ({ p, d: distM(pano, p, building) }))
    .filter(({ d }) => d <= 30)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
  for (const { p, d } of links) {
    out.push({ key: `pano-${p.id}`, kind: 'pano', pano: p, dist: d, yaw: yawTo(pano, p, building), pitch: pitchTo(d, 0) })
  }
  return [...out, ...manual(pano)]
}

function manual(pano) {
  return (pano.hotspots ?? []).map((h) => ({ key: `hs-${h.id}`, kind: 'info', hotspot: h, yaw: h.yaw, pitch: h.pitch }))
}

/** Панорама для места: внутри его помещения, иначе ближе 5 м */
export function panoForNode(node, { panoramas = [], rooms = [], building }) {
  if (!node) return null
  const room = rooms.find((r) => r.node_id === node.id)
  const same = panoramas.filter((p) => p.floor_id === node.floor_id && p.x != null)
  if (room) {
    const inside = same.filter((p) => p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h)
    if (inside.length) return inside.sort((a, b) => distM(a, node, building) - distM(b, node, building))[0]
  }
  const near = same.map((p) => ({ p, d: distM(p, node, building) })).filter(({ d }) => d <= 5).sort((a, b) => a.d - b.d)
  return near[0]?.p ?? null
}

function projectOnSegment(p, a, b, building) {
  const ax = a.x * building.width_m, ay = a.y * building.height_m
  const bx = b.x * building.width_m, by = b.y * building.height_m
  const px = p.x * building.width_m, py = p.y * building.height_m
  const vx = bx - ax, vy = by - ay
  const len2 = vx * vx + vy * vy || 1e-9
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
  const qx = ax + t * vx, qy = ay + t * vy
  return { d: Math.hypot(px - qx, py - qy), along: t * Math.sqrt(len2) }
}

/**
 * Панорамы вдоль маршрута (не дальше 4 м от линии) — по порядку движения.
 * Возвращает [{ pano, nextYaw }] — nextYaw: куда смотреть, чтобы идти дальше.
 */
export function tourAlongRoute(route, panoramas, building, maxDist = 4) {
  if (!route?.nodes?.length) return []
  const nodes = route.nodes
  const picked = []
  let offset = 0
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1] ?? nodes[i]
    if (b.floor_id !== a.floor_id) { offset += 1; continue }
    for (const p of panoramas) {
      if (p.x == null || p.floor_id !== a.floor_id) continue
      const { d, along } = projectOnSegment(p, a, b, building)
      if (d <= maxDist) picked.push({ pano: p, order: offset + along, d })
    }
    offset += distM(a, b, building) + 0.001
  }
  // Каждая панорама — один раз, в самом раннем месте маршрута, где она ближе всего
  const best = new Map()
  for (const it of picked) {
    const cur = best.get(it.pano.id)
    if (!cur || it.d < cur.d - 0.5 || (Math.abs(it.d - cur.d) <= 0.5 && it.order < cur.order)) best.set(it.pano.id, it)
  }
  const list = [...best.values()].sort((a, b) => a.order - b.order).map((it) => it.pano)
  const end = nodes[nodes.length - 1]
  return list.map((p, i) => {
    const next = list[i + 1]
    const target = next && next.floor_id === p.floor_id ? next : end.floor_id === p.floor_id ? end : nextNodeOnFloor(nodes, p)
    return { pano: p, nextYaw: target ? yawTo(p, target, building) : p.yaw, target: next ?? null }
  })
}

function nextNodeOnFloor(nodes, p) {
  // последняя точка маршрута на этаже панорамы (например, лестница)
  const onFloor = nodes.filter((n) => n.floor_id === p.floor_id)
  return onFloor[onFloor.length - 1] ?? null
}
