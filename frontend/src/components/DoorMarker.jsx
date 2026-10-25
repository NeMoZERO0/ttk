import React from 'react'

/**
 * Отрисовка архитектурного обозначения двери в SVG:
 * - single: одностворчатая дверь с полотном и дугой открывания
 * - double: двустворчатая дверь с двумя створками и дугами
 * - opening: открытый проём со стойками проёма
 */
export default function DoorMarker({
  x,
  y,
  widthPx = 24,
  angle = 0,
  type = 'single', // 'single' | 'double' | 'opening'
  swing = 'left',  // 'left' | 'right'
  color = '#1C2430',
  wallWidth = 6,
  selected = false,
  interactive = false,
  onPointerDown,
  onClick,
}) {
  const w = Math.max(12, widthPx)
  const halfW = w / 2

  // Логика направления открывания (инверсия знака Y)
  const flipY = swing === 'right' ? -1 : 1

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${angle})`}
      className={interactive ? 'cursor-pointer select-none' : ''}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {/* Пробивка стены (белая плашка под проёмом, чтобы перекрыть контур стены) */}
      <rect
        x={-halfW - 1}
        y={-wallWidth / 2 - 1}
        width={w + 2}
        height={wallWidth + 2}
        fill="#FFFFFF"
      />

      {/* Выделение при выборе */}
      {selected && (
        <rect
          x={-halfW - 6}
          y={-w - 6}
          width={w + 12}
          height={w * 2 + 12}
          fill="#3B82F6"
          fillOpacity="0.12"
          stroke="#3B82F6"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          rx="6"
        />
      )}

      {/* Ограничительные торцы стены (дверные косяки) */}
      <line
        x1={-halfW}
        y1={-wallWidth / 2 - 1}
        x2={-halfW}
        y2={wallWidth / 2 + 1}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      <line
        x1={halfW}
        y1={-wallWidth / 2 - 1}
        x2={halfW}
        y2={wallWidth / 2 + 1}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="square"
      />

      {type === 'single' && (
        <g>
          {/* Полотно двери (от петли под углом 90 градусов) */}
          <line
            x1={-halfW}
            y1={0}
            x2={-halfW}
            y2={-w * flipY}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Дуга хода полотна двери */}
          <path
            d={`M ${halfW} 0 A ${w} ${w} 0 0 ${flipY === 1 ? 0 : 1} ${-halfW} ${-w * flipY}`}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeDasharray="3 3"
            strokeOpacity="0.75"
          />
        </g>
      )}

      {type === 'double' && (
        <g>
          {/* Левая створка (ширина w/2) */}
          <line
            x1={-halfW}
            y1={0}
            x2={-halfW}
            y2={-halfW * flipY}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={`M 0 0 A ${halfW} ${halfW} 0 0 ${flipY === 1 ? 0 : 1} ${-halfW} ${-halfW * flipY}`}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeDasharray="2.5 2.5"
            strokeOpacity="0.75"
          />

          {/* Правая створка (ширина w/2) */}
          <line
            x1={halfW}
            y1={0}
            x2={halfW}
            y2={-halfW * flipY}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={`M 0 0 A ${halfW} ${halfW} 0 0 ${flipY === 1 ? 1 : 0} ${halfW} ${-halfW * flipY}`}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeDasharray="2.5 2.5"
            strokeOpacity="0.75"
          />
        </g>
      )}

      {type === 'opening' && (
        <g>
          {/* Для чистого проема — стрелка прохода или легкая осевая линия */}
          <line
            x1={-halfW + 3}
            y1={0}
            x2={halfW - 3}
            y2={0}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="4 3"
            strokeOpacity="0.4"
          />
        </g>
      )}

      {/* Невидимая область захвата для удобного клика */}
      {interactive && (
        <rect
          x={-halfW - 10}
          y={-w - 10}
          width={w + 20}
          height={w * 2 + 20}
          fill="transparent"
        />
      )}
    </g>
  )
}
