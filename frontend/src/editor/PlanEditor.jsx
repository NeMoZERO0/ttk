import React, { useLayoutEffect, useRef, useState } from 'react'
import RoomsLayer from '../components/RoomsLayer.jsx'
import DoorMarker from '../components/DoorMarker.jsx'
import {
  fmt,
  isCorridor,
  pointsBbox,
  pointsToSvgPath,
  polygonArea,
  polygonCentroid,
  viewSize,
} from '../lib/plan.js'
import { PoiIcon } from '../icons.jsx'

const SNAP_M = 0.5 // шаг привязки, м (при snapToGrid = true)
const PAD = 28     // поля вокруг здания, в единицах viewBox

export default function PlanEditor({
  rooms = [],
  building,
  selectedId,
  nodes = [],
  selectedDoorId = null,
  onSelect,
  onSelectDoor,
  onPreview,
  onCommit,
  onMoveDoor,
  mode = 'rooms',
  planUrl,
  planOpacity = 0.55,
  points = [],
  viewpoints = [],
  selectedPointId,
  selectedPanoId,
  onSelectPoint,
  onSelectPano,
  onMoveMarker,
  placing = null,
  onPlace,
  snapToGrid = true,
  onToggleSnap,
  onAddRoomClick,
  onAddDoorClick,
}) {
  const { W, H } = viewSize(building)
  const wm = building.width_m
  const hm = building.height_m
  const svgRef = useRef(null)
  const drag = useRef(null)
  const [pxPerUnit, setPxPerUnit] = useState(1)
  const [cursorPos, setCursorPos] = useState(null)

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setPxPerUnit(Math.min(width / (W + PAD * 2), height / (H + PAD * 2)) || 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])

  const u = 1 / pxPerUnit // одна экранная точка в единицах viewBox
  const selected = rooms.find((r) => r.id === selectedId)

  // Перевод координат экрана в единицы SVG
  const toSvg = (e) => {
    const pt = svgRef.current.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse())
  }

  // Привязка к сетке (в метрах)
  const snap = (v, free) =>
    free || !snapToGrid
      ? Math.round(v * 100) / 100
      : Math.round(v / SNAP_M) * SNAP_M

  // Получаем полигональные вершины выбранного помещения
  const getSelectedPolygonPoints = () => {
    if (!selected) return null
    if (selected.points && Array.isArray(selected.points) && selected.points.length >= 3) {
      return selected.points
    }
    // Если еще нет точек — формируем 4 угла квадрата/прямоугольника
    return [
      { x: selected.x, y: selected.y },
      { x: selected.x + selected.w, y: selected.y },
      { x: selected.x + selected.w, y: selected.y + selected.h },
      { x: selected.x, y: selected.y + selected.h },
    ]
  }

  // --- Захват перемещения всего помещения ---
  const startDragRoom = (e, room) => {
    e.stopPropagation()
    if (e.button !== 0) return
    onSelect(room.id)
    onSelectDoor?.(null)
    const p = toSvg(e)
    const pts = room.points && Array.isArray(room.points) && room.points.length >= 3
      ? room.points
      : [
          { x: room.x, y: room.y },
          { x: room.x + room.w, y: room.y },
          { x: room.x + room.w, y: room.y + room.h },
          { x: room.x, y: room.y + room.h },
        ]

    drag.current = {
      type: 'room',
      id: room.id,
      moved: false,
      sx: p.x,
      sy: p.y,
      x0: room.x,
      y0: room.y,
      w0: room.w,
      h0: room.h,
      initialPoints: pts,
      geom: null,
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  // --- Захват перемещения конкретной вершины полигона ---
  const startDragVertex = (e, index) => {
    e.stopPropagation()
    if (e.button !== 0 || !selected) return
    const p = toSvg(e)
    const pts = getSelectedPolygonPoints()
    drag.current = {
      type: 'vertex',
      roomId: selected.id,
      vertexIndex: index,
      moved: false,
      sx: p.x,
      sy: p.y,
      initialPoints: pts,
      v0: pts[index],
      geom: null,
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  // --- Добавление вершины на ребре (сплит ребра) ---
  const handleAddVertexOnEdge = (e, insertIndex, midPoint) => {
    e.stopPropagation()
    if (!selected) return
    const pts = getSelectedPolygonPoints()
    const newPoints = [
      ...pts.slice(0, insertIndex),
      midPoint,
      ...pts.slice(insertIndex),
    ]
    const bbox = pointsBbox(newPoints)
    onCommit(selected.id, { ...bbox, points: newPoints })
  }

  // --- Удаление вершины (двойной клик на вершине) ---
  const handleDeleteVertex = (e, index) => {
    e.stopPropagation()
    if (!selected) return
    const pts = getSelectedPolygonPoints()
    if (pts.length <= 3) return // минимально 3 вершины у многоугольника
    const newPoints = pts.filter((_, i) => i !== index)
    const bbox = pointsBbox(newPoints)
    onCommit(selected.id, { ...bbox, points: newPoints })
  }

  // --- Захват перемещения двери ---
  const startDragDoor = (e, door) => {
    e.stopPropagation()
    if (e.button !== 0) return
    onSelectDoor?.(door.id)
    onSelect?.(null)
    const p = toSvg(e)
    drag.current = {
      type: 'door',
      id: door.id,
      moved: false,
      sx: p.x,
      sy: p.y,
      x0: door.x,
      y0: door.y,
      pos: null,
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  // --- Захват точек / панорам ---
  const startMarker = (e, kind, m) => {
    e.stopPropagation()
    if (e.button !== 0) return
    if (kind === 'point') onSelectPoint?.(m.id)
    else onSelectPano?.(m.id)
    const p = toSvg(e)
    drag.current = {
      type: 'marker',
      marker: kind,
      id: m.id,
      sx: p.x,
      sy: p.y,
      x0: m.x,
      y0: m.y,
      moved: false,
      pos: null,
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  // --- Обработка перемещения мыши ---
  const onMove = (e) => {
    const p = toSvg(e)
    if (placing) setCursorPos(p)

    const d = drag.current
    if (!d) return

    const free = e.altKey || !snapToGrid

    // 1. Дверь
    if (d.type === 'door') {
      if (!d.moved && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) < 3 * u) return
      d.moved = true
      const xm = snap(d.x0 * wm + ((p.x - d.sx) / W) * wm, free)
      const ym = snap(d.y0 * hm + ((p.y - d.sy) / H) * hm, free)
      d.pos = {
        x: Math.min(Math.max(xm / wm, 0), 1),
        y: Math.min(Math.max(ym / hm, 0), 1),
      }
      onMoveDoor?.(d.id, d.pos, false)
      return
    }

    // 2. Маркер (точка POI / панорама)
    if (d.type === 'marker') {
      if (!d.moved && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) < 3 * u) return
      d.moved = true
      const step = free ? 0.01 : 0.25
      const xm = Math.round((d.x0 * wm + ((p.x - d.sx) / W) * wm) / step) * step
      const ym = Math.round((d.y0 * hm + ((p.y - d.sy) / H) * hm) / step) * step
      d.pos = {
        x: Math.min(Math.max(xm / wm, 0), 1),
        y: Math.min(Math.max(ym / hm, 0), 1),
      }
      onMoveMarker?.(d.marker, d.id, d.pos, false)
      return
    }

    // 3. Вершина полигона
    if (d.type === 'vertex') {
      if (!d.moved && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) < 3 * u) return
      d.moved = true
      const targetX_m = snap(d.v0.x * wm + ((p.x - d.sx) / W) * wm, free)
      const targetY_m = snap(d.v0.y * hm + ((p.y - d.sy) / H) * hm, free)
      const newVertex = {
        x: Math.min(Math.max(targetX_m / wm, 0), 1),
        y: Math.min(Math.max(targetY_m / hm, 0), 1),
      }
      const newPoints = d.initialPoints.map((pt, i) =>
        i === d.vertexIndex ? newVertex : pt,
      )
      const bbox = pointsBbox(newPoints)
      d.geom = { ...bbox, points: newPoints }
      onPreview(d.roomId, d.geom)
      return
    }

    // 4. Всё помещение целиком
    if (d.type === 'room') {
      if (!d.moved && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) < 3 * u) return
      d.moved = true
      const dxM = snap(d.x0 * wm + ((p.x - d.sx) / W) * wm, free) - d.x0 * wm
      const dyM = snap(d.y0 * hm + ((p.y - d.sy) / H) * hm, free) - d.y0 * hm

      const newPoints = d.initialPoints.map((pt) => ({
        x: Math.min(Math.max(pt.x + dxM / wm, 0), 1),
        y: Math.min(Math.max(pt.y + dyM / hm, 0), 1),
      }))
      const bbox = pointsBbox(newPoints)
      d.geom = { ...bbox, points: newPoints }
      onPreview(d.id, d.geom)
    }
  }

  // --- Отпускание клавиши мыши ---
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return

    if (d.type === 'door' && d.moved && d.pos) {
      onMoveDoor?.(d.id, d.pos, true)
      return
    }

    if (d.type === 'marker' && d.moved && d.pos) {
      onMoveMarker?.(d.marker, d.id, d.pos, true)
      return
    }

    if ((d.type === 'vertex' || d.type === 'room') && d.moved && d.geom) {
      onCommit(d.roomId || d.id, d.geom)
    }
  }

  // --- Клик по фону ---
  const onBackgroundDown = (e) => {
    if (placing) {
      const p = toSvg(e)
      if (p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H) {
        const free = e.altKey || !snapToGrid
        const targetX_m = snap((p.x / W) * wm, free)
        const targetY_m = snap((p.y / H) * hm, free)
        onPlace?.({
          x: Math.min(Math.max(targetX_m / wm, 0), 1),
          y: Math.min(Math.max(targetY_m / hm, 0), 1),
        })
      }
      return
    }
    onSelect(null)
    onSelectDoor?.(null)
    onSelectPoint?.(null)
    onSelectPano?.(null)
  }

  // Сетка: 1 м (если не слишком мелко) и 5 м
  const cell = W / wm
  const showFine = cell * pxPerUnit >= 7
  const ordered = [...rooms.filter(isCorridor), ...rooms.filter((r) => !isCorridor(r))]

  const polyPoints = getSelectedPolygonPoints()
  const customDoors = (nodes || []).filter((n) => n.type === 'door')

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* Верхний плавающий тулбар холста */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg ring-1 ring-[#1C2430]/10">
          {/* Тумблер привязки к сетке */}
          <button
            type="button"
            onClick={onToggleSnap}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
              snapToGrid
                ? 'bg-[#1C2430] text-white'
                : 'bg-[#F6F7F9] text-[#7A8594] hover:bg-[#E3E7EC]'
            }`}
            title="Включить / выключить привязку вершин к координатной сетке 0,5 м"
          >
            <span
              className={`size-2 rounded-full ${
                snapToGrid ? 'bg-[#FFC627] animate-pulse' : 'bg-gray-400'
              }`}
            />
            <span>Привязка к сетке: {snapToGrid ? 'ВКЛ' : 'ВЫКЛ'}</span>
          </button>

          <div className="w-px h-5 bg-[#E3E7EC]" />

          {/* Кнопка быстрого добавления помещения */}
          {onAddRoomClick && (
            <button
              type="button"
              onClick={onAddRoomClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#FFC627] text-[#1C2430] hover:bg-[#ffd04d] transition shadow-sm"
            >
              <span>+ Помещение</span>
            </button>
          )}

          {/* Кнопка добавления двери */}
          {onAddDoorClick && (
            <button
              type="button"
              onClick={onAddDoorClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition shadow-sm ${
                placing === 'door'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-white border border-[#E3E7EC] text-[#1C2430] hover:bg-[#F6F7F9]'
              }`}
            >
              <span>+ Дверь</span>
            </button>
          )}
        </div>

        {/* Подсказка при режиме размещения двери */}
        {placing === 'door' && (
          <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-2xl shadow-xl animate-bounce">
            <span>🚪 Кликните по сетке или стене, чтобы поставить дверь</span>
            <button
              type="button"
              onClick={() => onPlace?.(null)}
              className="ml-2 text-white/80 hover:text-white underline text-[11px]"
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className={`h-full w-full touch-none select-none outline-none ${
          placing ? 'cursor-crosshair' : ''
        }`}
        tabIndex={0}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <pattern id="grid-1" width={cell} height={H / hm} patternUnits="userSpaceOnUse">
            <path d={`M${cell} 0H0V${H / hm}`} fill="none" stroke="#D9DEE5" strokeWidth={u} />
          </pattern>
          <pattern id="grid-5" width={cell * 5} height={(H / hm) * 5} patternUnits="userSpaceOnUse">
            <path d={`M${cell * 5} 0H0V${(H / hm) * 5}`} fill="none" stroke="#BFC7D1" strokeWidth={1.4 * u} />
          </pattern>
        </defs>

        {/* Фоновая координатная сетка */}
        <rect x={0} y={0} width={W} height={H} fill="#FBFCFD" />
        {showFine && <rect x={0} y={0} width={W} height={H} fill="url(#grid-1)" />}
        <rect x={0} y={0} width={W} height={H} fill="url(#grid-5)" />
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="none"
          stroke="#9AA4B1"
          strokeWidth={1.5 * u}
          strokeDasharray={`${6 * u} ${5 * u}`}
        />

        {planUrl && (
          <image
            href={planUrl}
            x={0}
            y={0}
            width={W}
            height={H}
            preserveAspectRatio="none"
            opacity={planOpacity}
            pointerEvents="none"
          />
        )}

        {/* Базовый слой комнат и дверей */}
        <RoomsLayer
          rooms={rooms}
          nodes={nodes}
          building={building}
          showArea={mode === 'rooms'}
          W={W}
          H={H}
          overImage={Boolean(planUrl)}
        />

        {/* Интерактивные зоны захвата помещений */}
        {mode === 'rooms' &&
          !placing &&
          ordered.map((r) => {
            const hasPoly = r.points && Array.isArray(r.points) && r.points.length >= 3
            return hasPoly ? (
              <path
                key={r.id}
                d={pointsToSvgPath(r.points, W, H)}
                fill={r.id === selectedId ? 'rgba(255,198,39,.18)' : 'transparent'}
                className="cursor-move hover:fill-[rgba(28,36,48,.06)]"
                onPointerDown={(e) => startDragRoom(e, r)}
              >
                <title>{r.name}</title>
              </path>
            ) : (
              <rect
                key={r.id}
                x={r.x * W}
                y={r.y * H}
                width={r.w * W}
                height={r.h * H}
                fill={r.id === selectedId ? 'rgba(255,198,39,.18)' : 'transparent'}
                className="cursor-move hover:fill-[rgba(28,36,48,.06)]"
                onPointerDown={(e) => startDragRoom(e, r)}
              >
                <title>{r.name}</title>
              </rect>
            )
          })}

        {/* Редактирование геометрии полигона выбранного помещения */}
        {mode === 'rooms' && selected && polyPoints && (
          <g>
            {/* Контур выделенного полигона */}
            <path
              d={pointsToSvgPath(polyPoints, W, H)}
              fill="none"
              stroke="#E0A800"
              strokeWidth={3 * u}
              strokeDasharray={`${7 * u} ${4 * u}`}
              pointerEvents="none"
            />

            {/* Плашка с площадью по формуле Гаусса / Shoelace */}
            {(() => {
              const centroid = polygonCentroid(polyPoints)
              const area = polygonArea(polyPoints, building)
              const label = `${fmt(area, 1)} м² (${polyPoints.length} верш.)`
              const fs = 13 * u
              const lw = label.length * fs * 0.58 + 20 * u
              const cx = centroid.x * W
              const cy = centroid.y * H

              return (
                <g pointerEvents="none" transform={`translate(${cx}, ${cy})`}>
                  <rect
                    x={-lw / 2}
                    y={-fs - 6 * u}
                    width={lw}
                    height={fs + 12 * u}
                    rx={6 * u}
                    fill="#1C2430"
                    stroke="#FFC627"
                    strokeWidth={1.5 * u}
                  />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    fontSize={fs}
                    fontWeight="800"
                    fill="#FFFFFF"
                    fontFamily="Golos Text, Arial, sans-serif"
                  >
                    {label}
                  </text>
                </g>
              )
            })()}

            {/* Точки середины ребер (+) для добавления новых вершин */}
            {polyPoints.map((pt, i) => {
              const nextPt = polyPoints[(i + 1) % polyPoints.length]
              const midX = (pt.x + nextPt.x) / 2
              const midY = (pt.y + nextPt.y) / 2
              const screenX = midX * W
              const screenY = midY * H
              const radius = 8 * u

              return (
                <g
                  key={`mid-${i}`}
                  transform={`translate(${screenX}, ${screenY})`}
                  className="cursor-pointer group select-none"
                  onClick={(e) => handleAddVertexOnEdge(e, i + 1, { x: midX, y: midY })}
                >
                  <circle
                    r={radius}
                    fill="#1C2430"
                    stroke="#FFC627"
                    strokeWidth={2 * u}
                    className="transition hover:scale-125"
                  />
                  <text
                    x={0}
                    y={3.5 * u}
                    textAnchor="middle"
                    fontSize={12 * u}
                    fontWeight="900"
                    fill="#FFC627"
                    pointerEvents="none"
                  >
                    +
                  </text>
                  <title>Добавить вершину на этом участке стены</title>
                </g>
              )
            })}

            {/* Интерактивные маркеры вершин полигона */}
            {polyPoints.map((pt, idx) => {
              const vx = pt.x * W
              const vy = pt.y * H
              const vr = 10 * u

              return (
                <g
                  key={`v-${idx}`}
                  transform={`translate(${vx}, ${vy})`}
                  className="cursor-crosshair select-none"
                  onPointerDown={(e) => startDragVertex(e, idx)}
                  onDoubleClick={(e) => handleDeleteVertex(e, idx)}
                >
                  <circle
                    r={vr}
                    fill="#FFC627"
                    stroke="#1C2430"
                    strokeWidth={2.5 * u}
                  />
                  <circle r={3 * u} fill="#1C2430" />
                  <title>
                    Вершина {idx + 1}. Потяните для деформации формы; двойной клик для удаления.
                  </title>
                </g>
              )
            })}
          </g>
        )}

        {/* Пользовательские интерактивные двери */}
        {customDoors.map((d) => {
          const meta = d.meta || {}
          const doorWidthPx = ((meta.width_m || 1.0) / wm) * W
          const isSel = d.id === selectedDoorId

          return (
            <DoorMarker
              key={d.id}
              x={d.x * W}
              y={d.y * H}
              widthPx={doorWidthPx}
              angle={meta.angle || 0}
              type={meta.door_type || 'single'}
              swing={meta.swing || 'left'}
              wallWidth={6 * u}
              color="#1C2430"
              selected={isSel}
              interactive={true}
              onPointerDown={(e) => startDragDoor(e, d)}
              onClick={(e) => {
                e.stopPropagation()
                onSelectDoor?.(d.id)
                onSelect?.(null)
              }}
            />
          )
        })}

        {/* Призрак двери под курсором при добавлении */}
        {placing === 'door' && cursorPos && (
          <DoorMarker
            x={cursorPos.x}
            y={cursorPos.y}
            widthPx={(1.0 / wm) * W}
            angle={0}
            type="single"
            color="#3B82F6"
            wallWidth={4 * u}
          />
        )}

        {/* Точки POI */}
        {points.map((m) => {
          const active = mode === 'points'
          const sel = m.id === selectedPointId
          const r = (sel ? 15 : 12) * u
          return (
            <g
              key={m.id}
              transform={`translate(${m.x * W} ${m.y * H})`}
              style={{ cursor: active && !placing ? 'grab' : 'default' }}
              pointerEvents={active && !placing ? 'auto' : 'none'}
              opacity={active ? 1 : 0.45}
              onPointerDown={(e) => startMarker(e, 'point', m)}
            >
              <circle
                r={r}
                fill={sel ? '#FFC627' : '#1C2430'}
                stroke={sel ? '#1C2430' : '#fff'}
                strokeWidth={2.5 * u}
              />
              <foreignObject x={-8 * u} y={-8 * u} width={16 * u} height={16 * u} pointerEvents="none">
                <div style={{ color: sel ? '#1C2430' : '#fff', width: '100%', height: '100%' }}>
                  <PoiIcon node={m} className="h-full w-full" />
                </div>
              </foreignObject>
              {active && (
                <text
                  y={r + 15 * u}
                  textAnchor="middle"
                  fontSize={12 * u}
                  fontWeight="700"
                  fill="#1C2430"
                  stroke="#fff"
                  strokeWidth={3 * u}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fontFamily="Golos Text, Arial"
                >
                  {m.name}
                </text>
              )}
            </g>
          )
        })}

        {/* Точки съёмки панорам */}
        {mode === 'panos' &&
          viewpoints.map((m) => {
            const sel = m.id === selectedPanoId
            const r = (sel ? 15 : 12) * u
            const yawRad = ((m.yaw ?? 0) * Math.PI) / 180
            return (
              <g
                key={m.id}
                transform={`translate(${m.x * W} ${m.y * H})`}
                style={{ cursor: placing ? 'default' : 'grab' }}
                pointerEvents={placing ? 'none' : 'auto'}
                onPointerDown={(e) => startMarker(e, 'pano', m)}
              >
                <path
                  d={`M0 0 L${Math.sin(-yawRad - 0.45) * 34 * u} ${
                    -Math.cos(-yawRad - 0.45) * 34 * u
                  } A ${34 * u} ${34 * u} 0 0 1 ${
                    Math.sin(-yawRad + 0.45) * 34 * u
                  } ${-Math.cos(-yawRad + 0.45) * 34 * u} Z`}
                  fill="#FFC627"
                  opacity="0.45"
                />
                <circle r={r} fill={sel ? '#FFC627' : '#fff'} stroke="#1C2430" strokeWidth={2.5 * u} />
                <path
                  transform={`scale(${u * 0.85}) translate(-12 -12)`}
                  d="M4 8h3l2-3h6l2 3h3v11H4z M12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7"
                  fill="none"
                  stroke="#1C2430"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <text
                  y={r + 15 * u}
                  textAnchor="middle"
                  fontSize={12 * u}
                  fontWeight="700"
                  fill="#1C2430"
                  stroke="#fff"
                  strokeWidth={3 * u}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fontFamily="Golos Text, Arial"
                >
                  {m.name}
                </text>
              </g>
            )
          })}
      </svg>
    </div>
  )
}
