import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMaps, getMap, buildRoute, trackEvent } from './api.js'
import { splitByFloor } from './lib/route.js'
import { panoForNode, tourAlongRoute } from './lib/pano.js'
import PanoViewer from './components/PanoViewer.jsx'
import { isSavedOffline, offlineSupported, saveForOffline } from './lib/offline.js'
import { PoiIcon, Icon, ICONS, categoryLabel } from './icons.jsx'
import FloorMap from './components/FloorMap.jsx'
import FloorSwitcher from './components/FloorSwitcher.jsx'
import PoiCard from './components/PoiCard.jsx'
import RoutePanel from './components/RoutePanel.jsx'
import WelcomeModal from './components/WelcomeModal.jsx'

// Узлы-«коридоры» нужны только для построения пути, а точки съёмки панорам
// показываются отдельными значками камеры — в списке мест их нет
const isVisiblePoi = (n) => n.type !== 'corridor' && n.type !== 'viewpoint'

// ?embed=1 — карта встроена в чужой сайт: без ссылок на редактор
const EMBED = new URLSearchParams(window.location.search).get('embed') === '1'

// На телефоне карта сверху, панель снизу: после действия в панели прокручиваем к карте
const scrollToMap = () => {
  if (window.innerWidth < 1024) document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function readSlugFromUrl() {
  return new URLSearchParams(window.location.search).get('map')
}

function Shell({ children }) {
  return <div className="grid min-h-dvh place-items-center p-6">{children}</div>
}

function Message({ title, children, action }) {
  return (
    <Shell>
      <div className="max-w-md rounded-2xl bg-white p-6 ring-1 ring-line">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <div className="mt-2 text-[15px] leading-relaxed text-ink-soft">{children}</div>
        {action}
      </div>
    </Shell>
  )
}

export default function App() {
  const [maps, setMaps] = useState(null)
  const [slug, setSlug] = useState(readSlugFromUrl())
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [floorId, setFloorId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  const [routeOpen, setRouteOpen] = useState(false)
  const [fromId, setFromId] = useState(null)
  const [toId, setToId] = useState(null)
  const [route, setRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState(null)
  const [viewer, setViewer] = useState(null) // { pano } или { tour, index }
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [offlineState, setOfflineState] = useState(null) // null | {k} | 'done' | 'error'
  const [welcomeOpen, setWelcomeOpen] = useState(true)

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // 1. Список опубликованных карт
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listMaps()
      .then((list) => {
        if (cancelled) return
        setMaps(list)
        setSlug((s) => (s && list.some((m) => m.slug === s) ? s : list[0]?.slug ?? null))
      })
      .catch((e) => !cancelled && setLoadError(e))
    return () => { cancelled = true }
  }, [reloadKey])

  // 2. Данные выбранной карты
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setData(null)
    setRoute(null); setFromId(null); setToId(null); setSelectedId(null)
    getMap(slug)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setFloorId(d.floors[0]?.id ?? null)
        trackEvent(slug, 'view')
        const url = new URL(window.location.href)
        url.searchParams.set('map', slug)
        window.history.replaceState(null, '', url)
      })
      .catch((e) => !cancelled && setLoadError(e))
    return () => { cancelled = true }
  }, [slug, reloadKey])

  const floors = useMemo(() => [...(data?.floors ?? [])].sort((a, b) => a.level - b.level), [data])
  const floorsById = useMemo(() => Object.fromEntries(floors.map((f) => [f.id, f])), [floors])
  const pois = useMemo(() => (data?.nodes ?? []).filter(isVisiblePoi), [data])
  const poisById = useMemo(() => Object.fromEntries(pois.map((p) => [p.id, p])), [pois])
  const floor = floorsById[floorId]
  const selected = poisById[selectedId]
  const rooms = data?.rooms ?? []
  const roomsByNode = useMemo(() => Object.fromEntries(rooms.filter((r) => r.node_id).map((r) => [r.node_id, r])), [rooms])
  const panoramas = useMemo(() => (data?.panoramas ?? []).filter((p) => p.x != null), [data])
  const panoData = useMemo(() => ({
    nodes: data?.nodes ?? [], panoramas, building: data?.building, floors: data?.floors ?? [], rooms,
  }), [data, panoramas, rooms])
  const tour = useMemo(() => (route ? tourAlongRoute(route, panoramas, data?.building) : []), [route, panoramas, data])

  const runs = useMemo(() => (route ? splitByFloor(route.nodes) : []), [route])
  const routeFloorIds = useMemo(() => new Set(runs.map((r) => r.floorId)), [runs])
  const runsHere = runs.filter((r) => r.floorId === floorId)

  // Метки «перейти на другой этаж» в точках смены этажа
  const transitions = useMemo(() => {
    const out = []
    runs.forEach((run, i) => {
      if (run.floorId !== floorId) return
      const next = runs[i + 1]
      const prev = runs[i - 1]
      if (next) {
        const f = floorsById[next.floorId]
        const node = run.nodes[run.nodes.length - 1]
        out.push({ node, toFloor: f, label: `${node.type === 'elevator' ? 'Лифт' : 'Лестница'}: ${f?.name}` })
      }
      if (prev) {
        const f = floorsById[prev.floorId]
        out.push({ node: run.nodes[0], toFloor: f, label: `Назад: ${f?.name}` })
      }
    })
    return out.filter((t) => t.toFloor)
  }, [runs, floorId, floorsById])

  const doBuildRoute = useCallback(async (a = fromId, b = toId) => {
    if (!a || !b || a === b) return
    setRouteLoading(true); setRouteError(null)
    try {
      const r = await buildRoute(slug, a, b)
      setRoute(r)
      setSelectedId(null)
      if (r.nodes[0]) setFloorId(r.nodes[0].floor_id)
      trackEvent(slug, 'route', b)
      scrollToMap()
    } catch (e) {
      setRoute(null)
      setRouteError(e.status === 404
        ? 'Между этими местами нет прохода по плану. Попробуйте другую начальную точку или сообщите организатору.'
        : e.offline ? 'Сервер карты не отвечает. Проверьте, что бэкенд запущен.' : e.message)
    } finally {
      setRouteLoading(false)
    }
  }, [fromId, toId, slug])

  const pickRoutePoint = (which, id) => {
    const nextFrom = which === 'from' ? id : fromId
    const nextTo = which === 'to' ? id : toId
    if (which === 'from') setFromId(id); else setToId(id)
    setRouteOpen(true)
    setSelectedId(null)
    if (nextFrom && nextTo && nextFrom !== nextTo) doBuildRoute(nextFrom, nextTo)
  }

  const selectPoi = (id, fromList = false) => {
    setSelectedId(id)
    const p = poisById[id]
    if (p && p.floor_id !== floorId) setFloorId(p.floor_id)
    if (p) trackEvent(slug, 'poi', id)
    if (fromList) scrollToMap()
  }

  const resetRoute = () => { setRoute(null); setFromId(null); setToId(null); setRouteError(null) }

  // --- Состояния загрузки и ошибок ---
  if (loadError) {
    return (
      <Message
        title={loadError.offline ? 'Сервер карты не отвечает' : 'Не удалось загрузить карту'}
        action={
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}
            className="mt-5 rounded-xl bg-ink px-4 py-2.5 font-bold text-white hover:bg-[#2b3646]">
            Повторить
          </button>
        }
      >
        {loadError.offline ? (
          <p>Фронтенд ждёт API на <code className="rounded bg-plaster px-1">http://localhost:8000</code>. Запустите бэкенд командой <code className="rounded bg-plaster px-1">uvicorn app.main:app --reload</code> и нажмите «Повторить».</p>
        ) : (
          <p>{loadError.message}</p>
        )}
      </Message>
    )
  }
  if (maps && maps.length === 0) {
    return (
      <>
        <Message title="Опубликованных карт пока нет">
          <p>Создайте демо-карту командой <code className="rounded bg-plaster px-1">python -m app.seed</code> в папке бэкенда и обновите страницу.</p>
        </Message>
        <WelcomeModal
          isOpen={welcomeOpen}
          onClose={() => setWelcomeOpen(false)}
          maps={maps || []}
          currentSlug={slug}
          onSelectMap={(s) => setSlug(s)}
        />
      </>
    )
  }
  if (!data || !floor) {
    return (
      <>
        <Shell><p className="animate-pulse font-semibold text-ink-soft">Загружаем карту…</p></Shell>
        <WelcomeModal
          isOpen={welcomeOpen}
          onClose={() => setWelcomeOpen(false)}
          maps={maps || []}
          currentSlug={slug}
          onSelectMap={(s) => setSlug(s)}
        />
      </>
    )
  }

  const q = query.trim().toLowerCase()
  const listed = q
    ? pois.filter((p) => `${p.name} ${categoryLabel(p)} ${p.description ?? ''}`.toLowerCase().includes(q))
    : pois.filter((p) => p.floor_id === floorId)
  const floorPois = pois.filter((p) => p.floor_id === floorId)
  const routeStart = route?.nodes[0]
  const routeEnd = route?.nodes[route.nodes.length - 1]

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      {/* Панель */}
      <aside className="order-2 flex flex-col gap-5 border-line bg-plaster p-5 lg:order-1 lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:p-6">
        <header className="flex flex-col gap-3">
          {!EMBED && (
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-soft">
              <div className="flex items-center gap-2">
                <img src="/favicon.svg" alt="" className="size-6" />
                Карта пространства
              </div>
              <button
                type="button"
                onClick={() => setWelcomeOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-white ring-1 ring-line hover:bg-[#F6F7F9] text-ink transition"
              >
                <span>Выбрать событие</span>
                <svg className="size-3.5 text-[#7A8594]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          )}
          <div>
            <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em]">{data.title}</h1>
            {data.address && (
              <p className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[#7A8594]">
                <svg className="size-3.5 text-[#1C2430] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{data.address}</span>
              </p>
            )}
          </div>
          {maps && maps.length > 1 && (
            <button
              type="button"
              onClick={() => setWelcomeOpen(true)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-white border border-[#E3E7EC] text-xs font-bold text-[#1C2430] hover:border-[#1C2430]/40 transition text-left"
            >
              <span className="truncate">Событие: {data.title}</span>
              <span className="text-[#7A8594] shrink-0 ml-2">Сменить →</span>
            </button>
          )}
        </header>

        {routeOpen ? (
          <RoutePanel
            floors={floors} pois={pois} floorsById={floorsById}
            fromId={fromId} toId={toId} setFromId={setFromId} setToId={setToId}
            onBuild={() => doBuildRoute()} onReset={resetRoute}
            onClose={() => { setRouteOpen(false); resetRoute() }}
            loading={routeLoading} error={routeError} route={route}
            onGoFloor={setFloorId}
            tourLength={tour.length}
            onStartTour={() => setViewer({ tour, index: 0 })}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRouteOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3.5 text-[17px] font-extrabold text-ink shadow-[0_2px_0_#1C2430] ring-2 ring-ink transition hover:bg-[#ffd04d] active:translate-y-px active:shadow-none"
            >
              <Icon d={ICONS.route} /> Построить маршрут
            </button>

            <div>
              <label htmlFor="search" className="sr-only">Поиск места</label>
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
                <Icon d={ICONS.search} className="size-5 text-ink-soft" />
                <input
                  id="search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Аудитория, столовая, туалет…"
                  className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-ink-soft/70"
                />
              </div>
            </div>

            <section aria-labelledby="list-title">
              <h2 id="list-title" className="mb-2 text-sm font-semibold text-ink-soft">
                {q ? `Найдено: ${listed.length}` : `Места, ${floor.name}`}
              </h2>
              {listed.length === 0 ? (
                <p className="rounded-xl bg-white px-4 py-3 text-[15px] text-ink-soft ring-1 ring-line">
                  {q ? 'Ничего не нашли. Попробуйте другое слово, например «аудитория».' : 'На этом этаже пока нет точек.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {listed.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectPoi(p.id, true)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                          p.id === selectedId ? 'bg-white ring-2 ring-ink' : 'hover:bg-white'
                        }`}
                      >
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${p.id === selectedId ? 'bg-signal text-ink' : 'bg-ink text-white'}`}>
                          <PoiIcon node={p} className="size-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-sm text-ink-soft">
                            {categoryLabel(p)}{q ? `, ${floorsById[p.floor_id]?.name ?? ''}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {offlineSupported() && (
          <div className="mt-auto rounded-xl bg-white p-3 text-sm ring-1 ring-line">
            {offlineState === 'done' || (offlineState === null && isSavedOffline(data.slug)) ? (
              <p className="font-semibold">Карта и панорамы сохранены на устройстве — откроются и без интернета.</p>
            ) : offlineState && typeof offlineState === 'object' ? (
              <p role="status" className="font-semibold">Сохраняем… {Math.round(offlineState.k * 100)}%</p>
            ) : (
              <button type="button" disabled={!online}
                onClick={() => {
                  setOfflineState({ k: 0 })
                  saveForOffline(data, (k) => setOfflineState({ k })).then(() => setOfflineState('done')).catch(() => setOfflineState('error'))
                }}
                className="w-full text-left font-semibold text-ink underline-offset-4 hover:underline disabled:text-ink-soft">
                {offlineState === 'error' ? 'Не удалось сохранить — попробуйте ещё раз' : `Сохранить карту для работы без интернета (панорам: ${panoramas.length})`}
              </button>
            )}
          </div>
        )}

        {EMBED ? (
          <a href={`/?map=${encodeURIComponent(data.slug ?? slug)}`} target="_blank" rel="noreferrer"
            className="pt-1 text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Открыть карту на весь экран
          </a>
        ) : (
          <a href={`/editor?map=${encodeURIComponent(data.slug ?? slug)}`}
            className="pt-1 text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Редактор плана
          </a>
        )}
      </aside>

      {/* Карта */}
      <main className="relative order-1 h-[62vh] min-h-[380px] shrink-0 lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
        <FloorMap
          floor={floor}
          mapSlug={data.slug ?? slug}
          nodes={floorPois}
          selectedId={selectedId}
          onSelect={(id) => (id ? selectPoi(id) : setSelectedId(null))}
          routeRuns={runsHere}
          routeStartId={routeStart?.id}
          routeEndId={routeEnd?.id}
          transitions={transitions}
          onGoFloor={setFloorId}
          rooms={rooms.filter((r) => r.floor_id === floorId)}
          building={data.building}
          viewpoints={panoramas.filter((p) => p.floor_id === floorId)}
          onOpenPano={(p) => setViewer({ pano: p })}
        />

        <div className="absolute left-4 top-4 z-30 flex flex-col items-start gap-2">
          <p className="rounded-xl bg-white/95 px-3 py-2 text-lg font-extrabold leading-none shadow-sm ring-1 ring-line">{floor.name}</p>
          {!online && (
            <p role="status" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">Нет интернета — показываем сохранённую карту</p>
          )}
        </div>

        <div className="absolute right-4 top-4 z-30">
          <FloorSwitcher floors={floors} currentId={floorId} onChange={setFloorId} routeFloorIds={routeFloorIds} />
        </div>

        {selected && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-40 flex sm:right-auto">
            <PoiCard
              node={selected}
              room={roomsByNode[selected.id]}
              floor={floorsById[selected.floor_id]}
              onClose={() => setSelectedId(null)}
              onRouteFrom={() => pickRoutePoint('from', selected.id)}
              onRouteTo={() => pickRoutePoint('to', selected.id)}
              pano={panoForNode(selected, panoData)}
              onOpenPano={(p) => setViewer({ pano: p })}
            />
          </div>
        )}
      </main>

      {viewer && (
        <PanoViewer
          startPano={viewer.pano}
          tour={viewer.tour}
          startIndex={viewer.index ?? 0}
          data={panoData}
          destinationId={route?.nodes[route.nodes.length - 1]?.id}
          onClose={() => setViewer(null)}
          onTrack={(p) => trackEvent(slug, 'pano', p.node_id)}
          onRouteTo={(node) => { setViewer(null); pickRoutePoint('to', node.id) }}
        />
      )}

      {/* Модальное окно выбора адреса и мероприятия */}
      <WelcomeModal
        isOpen={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        maps={maps || []}
        currentSlug={slug}
        onSelectMap={(s) => setSlug(s)}
      />
    </div>
  )
}
