import { useId } from 'react'
import { bbox, computeDoors, fmt, isCorridor, pointsToSvgPath, polygonCentroid, roomArea, viewSize } from '../lib/plan.js'
import DoorMarker from './DoorMarker.jsx'

const INK = '#1C2430'
const CORRIDOR_FILL = '#E3E7EC'
const LABEL = '#8A94A3'

/**
 * Статичный план этажа из комнат: коридоры, стены, проёмы, двери, подписи.
 * Рисуется внутри <svg viewBox="0 0 W H">.
 * showArea — подписывать площадь (в редакторе).
 * overImage — план загружен картинкой: комнаты полупрозрачные поверх неё.
 */
export default function RoomsLayer({ rooms = [], nodes = [], building, showArea = false, overImage = false, W: w0, H: h0 }) {
  const uid = useId().replace(/:/g, '')
  const fallback = viewSize(building)
  const W = w0 ?? fallback.W
  const H = h0 ?? fallback.H
  const corridors = rooms.filter(isCorridor)
  const spaces = rooms.filter((r) => !isCorridor(r))
  const autoDoors = computeDoors(rooms, building)
  const customDoors = (nodes || []).filter((n) => n.type === 'door')
  const outline = bbox(rooms)
  const wall = 4

  const label = (r) => {
    const isPoly = r.points && Array.isArray(r.points) && r.points.length >= 3
    const c = isPoly ? polygonCentroid(r.points) : { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    const wpx = r.w * W
    const hpx = r.h * H
    if (wpx < 36 || hpx < 26) return null
    const fs = Math.max(10, Math.min(15, wpx / 7))
    const lx = isPoly ? c.x * W : r.x * W + 9
    const ly = isPoly ? c.y * H : r.y * H + fs + 7
    const anchor = isPoly ? 'middle' : 'start'

    return (
      <g fontFamily="Golos Text, Arial, sans-serif" pointerEvents="none">
        <text
          x={lx}
          y={ly}
          textAnchor={anchor}
          fontSize={fs}
          fill={isCorridor(r) ? '#7A8594' : LABEL}
          fontWeight="500"
        >
          {r.name.length * fs * 0.55 > wpx - 14 ? `${r.name.slice(0, Math.max(3, Math.floor((wpx - 14) / (fs * 0.55)) - 1))}…` : r.name}
        </text>
        {showArea && hpx > 45 && (
          <text
            x={lx}
            y={ly + fs + 4}
            textAnchor={anchor}
            fontSize={fs - 2}
            fill={INK}
            fontWeight="600"
          >
            {fmt(roomArea(r, building), 0)} м²
          </text>
        )}
      </g>
    )
  }

  return (
    <g>
      <defs>
        <pattern id={`steps-${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <line x1="0" y1="7" x2="14" y2="7" stroke={INK} strokeOpacity=".35" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Коридоры и проходные зоны */}
      {corridors.map((r) => {
        const hasPoly = r.points && Array.isArray(r.points) && r.points.length >= 3
        const fill = r.category === 'outdoor' ? '#D7E6CC' : CORRIDOR_FILL
        return hasPoly ? (
          <path
            key={r.id}
            d={pointsToSvgPath(r.points, W, H)}
            fill={fill}
            fillOpacity={overImage ? 0.6 : 1}
          />
        ) : (
          <rect
            key={r.id}
            x={r.x * W}
            y={r.y * H}
            width={r.w * W}
            height={r.h * H}
            fill={fill}
            fillOpacity={overImage ? 0.6 : 1}
          />
        )
      })}

      {/* Помещения (прямоугольные или произвольные полигоны) */}
      {spaces.map((r) => {
        const hasPoly = r.points && Array.isArray(r.points) && r.points.length >= 3
        const x = r.x * W
        const y = r.y * H
        const w = r.w * W
        const h = r.h * H

        return (
          <g key={r.id}>
            {hasPoly ? (
              <path
                d={pointsToSvgPath(r.points, W, H)}
                fill="#ffffff"
                fillOpacity={overImage ? 0.55 : 1}
                stroke={INK}
                strokeWidth={wall}
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#ffffff"
                fillOpacity={overImage ? 0.55 : 1}
                stroke={INK}
                strokeWidth={wall}
              />
            )}
            {r.category === 'stairs' && w > 30 && h > 50 && (
              <rect x={x + 12} y={y + 36} width={w - 24} height={h - 50} fill={`url(#steps-${uid})`} />
            )}
            {r.category === 'elevator' && w > 24 && h > 50 && (
              <path
                d={`M${x + 12} ${y + 36} L${x + w - 12} ${y + h - 14} M${x + w - 12} ${y + 36} L${x + 12} ${y + h - 14}`}
                stroke={INK}
                strokeOpacity=".3"
                strokeWidth="2"
              />
            )}
          </g>
        )
      })}

      {/* Автоматические проёмы между комнатами и коридором */}
      {autoDoors.map((d, i) =>
        d.horizontal ? (
          <rect
            key={`ad-${i}`}
            x={(d.x - d.size / 2) * W}
            y={d.y * H - wall}
            width={d.size * W}
            height={wall * 2}
            fill={CORRIDOR_FILL}
          />
        ) : (
          <rect
            key={`ad-${i}`}
            x={d.x * W - wall}
            y={(d.y - d.size / 2) * H}
            width={wall * 2}
            height={d.size * H}
            fill={CORRIDOR_FILL}
          />
        ),
      )}

      {/* Пользовательские двери, добавленные на план */}
      {customDoors.map((d) => {
        const meta = d.meta || {}
        const doorWidthPx = ((meta.width_m || 1.0) / (building?.width_m || 60)) * W
        return (
          <DoorMarker
            key={d.id}
            x={d.x * W}
            y={d.y * H}
            widthPx={doorWidthPx}
            angle={meta.angle || 0}
            type={meta.door_type || 'single'}
            swing={meta.swing || 'left'}
            wallWidth={wall}
            color={INK}
          />
        )
      })}

      {/* Внешний контур здания */}
      {outline && (
        <rect
          x={outline.x * W}
          y={outline.y * H}
          width={outline.w * W}
          height={outline.h * H}
          fill="none"
          stroke={INK}
          strokeWidth="8"
          strokeLinejoin="round"
        />
      )}

      {/* Подписи помещений */}
      {rooms.map((r) => (
        <g key={`l-${r.id}`}>{label(r)}</g>
      ))}
    </g>
  )
}
