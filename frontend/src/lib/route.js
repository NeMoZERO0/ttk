// Разбор ответа POST /public/maps/{slug}/route:
// { nodes: [{id, x, y, floor_id, name, type, panorama_id}], length, panoramas }

/** Делит путь на отрезки по этажам: [{ floorId, nodes: [...] }, ...] */
export function splitByFloor(routeNodes) {
  const runs = []
  for (const n of routeNodes) {
    const last = runs[runs.length - 1]
    if (last && last.floorId === n.floor_id) last.nodes.push(n)
    else runs.push({ floorId: n.floor_id, nodes: [n] })
  }
  return runs
}

const TRANSITION_WORDS = {
  stairs: { up: 'Поднимитесь по лестнице', down: 'Спуститесь по лестнице' },
  elevator: { up: 'Поднимитесь на лифте', down: 'Спуститесь на лифте' },
}

/** Пошаговая инструкция для посетителя */
export function describeRoute(route, floorsById) {
  const runs = splitByFloor(route.nodes)
  const start = route.nodes[0]
  const end = route.nodes[route.nodes.length - 1]
  const steps = [{ kind: 'start', text: `Начните у точки «${start.name}»`, floorId: start.floor_id }]

  for (let i = 0; i < runs.length - 1; i++) {
    const from = runs[i].nodes[runs[i].nodes.length - 1]
    const nextFloor = floorsById[runs[i + 1].floorId]
    const curFloor = floorsById[runs[i].floorId]
    const dir = (nextFloor?.level ?? 0) >= (curFloor?.level ?? 0) ? 'up' : 'down'
    const words = TRANSITION_WORDS[from.type]?.[dir] ?? (dir === 'up' ? 'Поднимитесь' : 'Спуститесь')
    steps.push({
      kind: 'walk',
      text: `Пройдите к точке «${from.name}» (${curFloor?.name ?? 'этаж'})`,
      floorId: runs[i].floorId,
    })
    steps.push({
      kind: 'transition',
      text: `${words}: ${nextFloor?.name ?? 'следующий этаж'}`,
      floorId: runs[i + 1].floorId,
    })
  }
  steps.push({ kind: 'end', text: `Вы на месте: «${end.name}»`, floorId: end.floor_id })
  return steps
}

/** Человекочитаемая длина и время пешком (≈ 70 м в минуту) */
export function formatLength(length) {
  const m = Math.max(1, Math.round(length))
  const min = Math.max(1, Math.round(m / 70))
  return { meters: `${m} м`, minutes: `${min} мин` }
}
