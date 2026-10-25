import { useEffect, useRef, useState } from 'react'
import { stitchPanorama } from '../lib/stitch.js'

const TIPS = [
  'Встаньте в точке съёмки и не сходите с места — поворачивайтесь вокруг себя, телефон держите у груди.',
  'Держите телефон вертикально и ровно, без наклона вверх или вниз.',
  'Каждый следующий кадр должен примерно на треть перекрывать предыдущий — ориентируйтесь на подсказку угла.',
  'Снимайте при одинаковом свете и не ловите в кадр людей, которые двигаются.',
]

function Ring({ n, current, done, heading }) {
  const R = 70, C = 90
  return (
    <svg viewBox="0 0 180 180" className="size-44" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a0 = ((i - 0.5) / n) * 2 * Math.PI - Math.PI / 2
        const a1 = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2
        const p = (a, r) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`
        const d = `M ${p(a0, R - 22)} L ${p(a0, R)} A ${R} ${R} 0 0 1 ${p(a1, R)} L ${p(a1, R - 22)} A ${R - 22} ${R - 22} 0 0 0 ${p(a0, R - 22)} Z`
        const fill = i === current ? '#FFC627' : done[i] ? '#1C2430' : '#E3E7EC'
        return <path key={i} d={d} fill={fill} stroke="#fff" strokeWidth="3" />
      })}
      {heading != null && (
        <g transform={`rotate(${heading} ${C} ${C})`}>
          <path d={`M ${C} ${C - 44} l -7 14 h 14 z`} fill="#B4232A" />
        </g>
      )}
      <circle cx={C} cy={C} r="30" fill="#fff" />
      <text x={C} y={C + 6} textAnchor="middle" fontSize="20" fontWeight="800" fill="#1C2430" fontFamily="Golos Text, Arial">
        {Math.min(current + 1, n)}/{n}
      </text>
    </svg>
  )
}

/**
 * Пошаговая съёмка панорамы: серия кадров с поворотом на месте → склейка в браузере.
 * onDone(blob) — готовая панорама 2:1 (JPEG).
 */
export default function CaptureWizard({ onDone, onCancel }) {
  const [n, setN] = useState(8)
  const [stage, setStage] = useState('intro') // intro | shoot | stitch | preview
  const [shots, setShots] = useState([])
  const [progress, setProgress] = useState({ k: 0, label: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [heading, setHeading] = useState(null)
  const [startHeading, setStartHeading] = useState(null)
  const inputRef = useRef(null)
  const multiRef = useRef(null)

  // Компас (если телефон его отдаёт) — подсказка, насколько повернуться
  useEffect(() => {
    if (stage !== 'shoot') return
    const onOri = (e) => {
      const h = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
      if (h != null) setHeading(h)
    }
    window.addEventListener('deviceorientation', onOri)
    return () => window.removeEventListener('deviceorientation', onOri)
  }, [stage])

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const addShot = (file) => {
    if (!file) return
    if (shots.length === 0 && heading != null) setStartHeading(heading)
    setShots((s) => [...s, { file, url: URL.createObjectURL(file) }])
  }
  const retakeLast = () => setShots((s) => { const last = s[s.length - 1]; if (last) URL.revokeObjectURL(last.url); return s.slice(0, -1) })

  const stitch = async (list = shots) => {
    setStage('stitch'); setError(null)
    try {
      const res = await stitchPanorama(list.map((s) => s.file), { onProgress: (k, label) => setProgress({ k, label }) })
      setResult({ ...res, url: URL.createObjectURL(res.blob) })
      setStage('preview')
    } catch (e) {
      setError(e.message || 'Не удалось склеить снимки')
      setStage('shoot')
    }
  }

  const pickMany = (files) => {
    const list = [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name))
    const items = list.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setShots(items)
    setN(items.length)
    if (items.length >= 3) stitch(items)
  }

  // Насколько ещё повернуться к следующему кадру (по компасу)
  const targetDelta = startHeading != null && heading != null
    ? ((((startHeading + (shots.length * 360) / n - heading) % 360) + 540) % 360) - 180
    : null

  return (
    <div className="flex flex-col gap-4">
      {stage === 'intro' && (
        <>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Сделайте серию снимков, поворачиваясь на месте по часовой стрелке. Сервис сам склеит их в панораму 360°.
          </p>
          <ol className="flex flex-col gap-2">
            {TIPS.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-ink-soft">Сколько кадров</legend>
            <div className="flex gap-2">
              {[[8, 'по 45° — быстро'], [12, 'по 30° — надёжнее']].map(([v, l]) => (
                <label key={v} className={`flex flex-1 cursor-pointer flex-col rounded-xl px-3 py-2 ring-1 ${n === v ? 'bg-white ring-2 ring-ink' : 'ring-line hover:bg-white'}`}>
                  <input type="radio" name="shots" className="sr-only" checked={n === v} onChange={() => setN(v)} />
                  <span className="font-bold">{v} кадров</span>
                  <span className="text-xs text-ink-soft">{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStage('shoot')}
              className="rounded-xl bg-signal px-4 py-3 font-extrabold text-ink ring-2 ring-ink">Начать съёмку</button>
            <button type="button" onClick={() => multiRef.current?.click()}
              className="rounded-xl px-4 py-3 text-sm font-semibold text-ink-soft ring-1 ring-line hover:bg-white">
              Уже есть снимки — выбрать
            </button>
            <button type="button" onClick={onCancel} className="rounded-xl px-4 py-3 text-sm font-semibold text-ink-soft hover:text-ink">Отмена</button>
          </div>
          <input ref={multiRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) pickMany(e.target.files); e.target.value = '' }} />
        </>
      )}

      {stage === 'shoot' && (
        <>
          <div className="flex items-center gap-4">
            <Ring n={n} current={shots.length} done={Array.from({ length: n }, (_, i) => i < shots.length)}
              heading={targetDelta != null ? targetDelta : null} />
            <div className="min-w-0 flex-1">
              {shots.length < n ? (
                <>
                  <p className="text-lg font-extrabold leading-tight">Кадр {shots.length + 1} из {n}</p>
                  <p className="mt-1 text-[15px] leading-snug text-ink-soft">
                    {shots.length === 0
                      ? 'Встаньте лицом к главному объекту помещения и сделайте первый кадр.'
                      : `Повернитесь вправо на ${Math.round(360 / n)}° от предыдущего кадра.`}
                  </p>
                  {targetDelta != null && shots.length > 0 && (
                    <p className={`mt-1 text-sm font-semibold ${Math.abs(targetDelta) < 6 ? 'text-[#1F7A3F]' : 'text-ink'}`}>
                      {Math.abs(targetDelta) < 6 ? 'Угол верный — снимайте' : `Ещё ${Math.round(Math.abs(targetDelta))}° ${targetDelta > 0 ? 'вправо' : 'влево'}`}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-lg font-extrabold leading-tight">Все кадры сняты</p>
                  <p className="mt-1 text-[15px] text-ink-soft">Последний кадр должен заходить на первый. Можно склеивать.</p>
                </>
              )}
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm font-medium text-alert">{error}</p>}

          {shots.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {shots.map((s, i) => (
                <img key={s.url} src={s.url} alt={`Кадр ${i + 1}`} className="h-16 w-12 shrink-0 rounded-md object-cover ring-1 ring-line" />
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {shots.length < n ? (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="flex-1 rounded-xl bg-signal px-4 py-3.5 text-[17px] font-extrabold text-ink ring-2 ring-ink">
                Сделать кадр {shots.length + 1}
              </button>
            ) : (
              <button type="button" onClick={() => stitch()}
                className="flex-1 rounded-xl bg-signal px-4 py-3.5 text-[17px] font-extrabold text-ink ring-2 ring-ink">
                Склеить панораму
              </button>
            )}
            {shots.length > 0 && (
              <button type="button" onClick={retakeLast}
                className="rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-line hover:bg-white">Переснять последний</button>
            )}
            {shots.length >= 3 && shots.length < n && (
              <button type="button" onClick={() => stitch()}
                className="rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-line hover:bg-white">Склеить из {shots.length}</button>
            )}
            <button type="button" onClick={onCancel} className="rounded-xl px-3 py-3 text-sm font-semibold text-ink-soft hover:text-ink">Отмена</button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { addShot(e.target.files?.[0]); e.target.value = '' }} />
        </>
      )}

      {stage === 'stitch' && (
        <div className="flex flex-col gap-3 py-4" role="status">
          <p className="text-lg font-extrabold">{progress.label || 'Склеиваем панораму'}…</p>
          <div className="h-3 overflow-hidden rounded-full bg-corridor">
            <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${Math.round(progress.k * 100)}%` }} />
          </div>
          <p className="text-sm text-ink-soft">Склейка идёт прямо на устройстве, снимки никуда не отправляются, пока вы не сохраните результат.</p>
        </div>
      )}

      {stage === 'preview' && result && (
        <>
          <img src={result.url} alt="Склеенная панорама" className="w-full rounded-lg ring-1 ring-line" />
          <p className="text-sm text-ink-soft">
            {result.info.aligned
              ? `Кадры выровнены автоматически, угол обзора камеры ≈ ${result.info.fov}°.`
              : 'Не удалось точно совместить кадры — они расставлены по равным углам. Если стыки заметны, переснимите с бо́льшим перекрытием (12 кадров).'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onDone(result.blob)}
              className="flex-1 rounded-xl bg-signal px-4 py-3 font-extrabold text-ink ring-2 ring-ink">Сохранить панораму</button>
            <button type="button" onClick={() => { setResult(null); setShots([]); setStage('shoot') }}
              className="rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-line hover:bg-white">Переснять</button>
          </div>
        </>
      )}
    </div>
  )
}
