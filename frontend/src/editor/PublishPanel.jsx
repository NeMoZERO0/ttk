import { useEffect, useState } from 'react'
import * as api from './editorApi.js'

function CopyField({ id, label, value, multiline }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch {
      const el = document.getElementById(id); el?.select(); document.execCommand?.('copy')
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  const cls = 'w-full min-w-0 rounded-lg bg-white px-3 py-2 font-mono text-[13px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-ink'
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-soft">{label}</label>
      {multiline
        ? <textarea id={id} readOnly rows={4} value={value} onFocus={(e) => e.target.select()} className={`${cls} resize-none`} />
        : <input id={id} readOnly value={value} onFocus={(e) => e.target.select()} className={cls} />}
      <button type="button" onClick={copy} className="self-start rounded-lg bg-ink px-3 py-1.5 text-sm font-bold text-white hover:bg-[#2b3646]">
        {copied ? 'Скопировано' : 'Скопировать'}
      </button>
    </div>
  )
}

const KINDS = [['view', 'Просмотры карты'], ['poi', 'Открытия мест'], ['route', 'Маршруты'], ['pano', 'Панорамы']]

export default function PublishPanel({ map, onPublish }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    api.getStats(map.id).then(setStats).catch((e) => setError(e.message))
  }, [map.id])

  const link = `${window.location.origin}/?map=${encodeURIComponent(map.slug)}`
  const embed = `<iframe src="${link}&embed=1" width="100%" height="640" style="border:0;border-radius:12px" allow="fullscreen; gyroscope; accelerometer" loading="lazy" title="Карта: ${map.title.replace(/"/g, '&quot;')}"></iframe>`
  const published = map.status === 'published'
  const max = Math.max(1, ...(stats?.views_by_day ?? []).map((d) => d.views))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="pub-title">
        <h2 id="pub-title" className="text-lg font-extrabold">Публикация</h2>
        {published ? (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Карта опубликована. Ссылка постоянная: всё, что вы меняете в редакторе, посетители видят по ней же — переопубликовывать не нужно.
          </p>
        ) : (
          <>
            <p className="text-[15px] text-ink-soft">Карта пока видна только вам. Опубликуйте её, чтобы делиться ссылкой.</p>
            <button type="button" onClick={onPublish} className="self-start rounded-xl bg-signal px-4 py-3 font-extrabold text-ink ring-2 ring-ink">Опубликовать</button>
          </>
        )}
        {published && (
          <>
            <CopyField id="pub-link" label="Ссылка для посетителей" value={link} />
            <CopyField id="pub-embed" label="Код для встраивания на сайт" value={embed} multiline />
            <a href={`${link}&embed=1`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink">
              Как будет выглядеть на сайте
            </a>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="stats-title">
        <h2 id="stats-title" className="text-lg font-extrabold">Статистика</h2>
        {error && <p className="text-sm text-alert">{error}</p>}
        {!stats && !error && <p className="text-sm text-ink-soft">Загружаем…</p>}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map(([k, label]) => (
                <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-line">
                  <p className="text-2xl font-extrabold tabular-nums">{stats.totals[k].toLocaleString('ru-RU')}</p>
                  <p className="text-sm text-ink-soft">{label}</p>
                </div>
              ))}
            </div>
            <figure className="rounded-xl bg-white p-3 ring-1 ring-line">
              <figcaption className="mb-2 text-sm text-ink-soft">Просмотры карты за 14 дней</figcaption>
              <div className="flex h-24 items-end gap-[2px] border-b border-line" role="img"
                aria-label={stats.views_by_day.map((d) => `${d.date}: ${d.views}`).join('; ')}>
                {stats.views_by_day.map((d) => (
                  <div key={d.date} className="group relative flex h-full flex-1 items-end">
                    <div className="w-full rounded-t-[4px] bg-ink transition group-hover:bg-signal-deep"
                      style={{ height: `${d.views ? Math.max(4, (d.views / max) * 100) : 0}%` }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-white group-hover:block">
                      {new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: {d.views}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-ink-soft">
                <span>{new Date(stats.views_by_day[0].date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                <span>сегодня</span>
              </div>
            </figure>
            {stats.top_places.length > 0 && (
              <table className="w-full text-left text-sm">
                <caption className="mb-1 text-left text-sm text-ink-soft">Популярные места</caption>
                <thead className="sr-only"><tr><th>Место</th><th>Открытий и маршрутов</th></tr></thead>
                <tbody>
                  {stats.top_places.map((p) => (
                    <tr key={p.node_id} className="border-b border-line last:border-0">
                      <td className="py-1.5 font-semibold">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-soft">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  )
}
