import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './editorApi.js'
import PlanEditor from './PlanEditor.jsx'
import RoomForm, { NumberField } from './RoomForm.jsx'
import PointForm from './PointForm.jsx'
import PanoPanel, { AddPanoDialog } from './PanoPanel.jsx'
import PanoSetup from './PanoSetup.jsx'
import PublishPanel from './PublishPanel.jsx'
import MapsDashboard from './MapsDashboard.jsx'
import AddRoomDialog from './AddRoomDialog.jsx'
import DoorSettings from './DoorSettings.jsx'
import { fileUrl } from '../api.js'
import { fmt, isCorridor } from '../lib/plan.js'
import { Icon, ICONS, PoiIcon, categoryLabel } from '../icons.jsx'

const inputCls = 'rounded-lg bg-white px-3 py-2.5 text-[15px] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink'
const primaryCls = 'flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-bold text-white transition hover:bg-[#2b3646] disabled:bg-ink/30'
const bigYellow = 'flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[17px] font-extrabold ring-2 ring-ink transition'

const TABS = [['rooms', 'Помещения'], ['points', 'Точки'], ['panos', 'Панорамы'], ['publish', 'Публикация']]

function Centered({ children }) {
  return <div className="grid min-h-dvh place-items-center bg-plaster p-6">{children}</div>
}

function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password)
      onLoggedIn(res.access_token)
    } catch (err) {
      setError(err.offline ? 'Сервер карты не отвечает. Проверьте, что бэкенд запущен.'
        : err.status === 401 ? 'Неверная почта или пароль.'
          : err.status === 422 ? 'Проверьте почту; пароль — не короче 6 символов.'
            : err.message)
    } finally { setBusy(false) }
  }

  return (
    <Centered>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 ring-1 ring-line">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <img src="/favicon.svg" alt="" className="size-6" /> Карта пространства
        </div>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">
          {mode === 'login' ? 'Вход для организатора' : 'Новый аккаунт организатора'}
        </h1>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Почта</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Пароль</span>
          <input type="password" required minLength={mode === 'login' ? undefined : 6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm font-medium text-alert">{error}</p>}
        <button type="submit" disabled={busy} className={primaryCls}>
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
        {mode === 'login' && (
          <button type="button" onClick={() => { setEmail('demo@space-map.app'); setPassword('demo123') }}
            className="rounded-lg bg-plaster px-3 py-2 text-left text-sm text-ink-soft hover:text-ink">
            Демо-доступ: <b className="font-semibold text-ink">demo@space-map.app</b> / <b className="font-semibold text-ink">demo123</b>. Нажмите, чтобы подставить.
          </button>
        )}
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          className="text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </Centered>
  )
}

export default function EditorApp() {
  const [token, setTok] = useState(api.getToken())
  const [maps, setMaps] = useState(null)
  const [mapId, setMapId] = useState(null)
  const [viewMode, setViewMode] = useState(() => {
    return new URLSearchParams(window.location.search).get('map') ? 'editor' : 'dashboard'
  })

  const [floors, setFloors] = useState([])
  const [floorId, setFloorId] = useState(null)
  const [building, setBuilding] = useState(null)
  const [rooms, setRooms] = useState([])
  const [nodes, setNodes] = useState([])
  const [panos, setPanos] = useState([])
  const [tab, setTab] = useState('rooms')
  const [selectedId, setSelectedId] = useState(null)
  const [selPointId, setSelPointId] = useState(null)
  const [selPanoId, setSelPanoId] = useState(null)
  const [selectedDoorId, setSelectedDoorId] = useState(null)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(() => localStorage.getItem('space-map-snap') !== 'false')

  const [placing, setPlacing] = useState(null) // 'point' | 'pano' | 'door'
  const [addSpot, setAddSpot] = useState(null) // место новой панорамы
  const [setupId, setSetupId] = useState(null)
  const [planOpacity, setPlanOpacity] = useState(0.55)
  const [save, setSave] = useState({ state: 'idle' })
  const [fatal, setFatal] = useState(null)

  const mapIdRef = useRef(null)
  mapIdRef.current = mapId
  const pending = useRef({})
  const timer = useRef(null)
  const pendingNodes = useRef({})
  const nodeTimer = useRef(null)
  const planInput = useRef(null)

  const logout = useCallback(() => {
    api.setToken(null); setTok(null); setMaps(null); setMapId(null); setViewMode('dashboard')
  }, [])

  const handleError = useCallback((e) => {
    if (e.status === 401) { logout(); return }
    setSave({ state: 'error', message: e.offline ? 'Сервер карты не отвечает — изменения не сохранены.' : `Не сохранилось: ${e.message}` })
  }, [logout])

  const toggleSnap = () => {
    setSnapToGrid((s) => {
      const next = !s
      try { localStorage.setItem('space-map-snap', String(next)) } catch {}
      return next
    })
  }

  // Карты организатора
  useEffect(() => {
    if (!token) return
    setFatal(null)
    api.listMaps().then((list) => {
      setMaps(list)
      const want = new URLSearchParams(window.location.search).get('map')
      const m = list.find((x) => x.slug === want) ?? list[0]
      if (want) {
        setMapId(m?.id ?? null)
        setViewMode('editor')
      }
    }).catch((e) => (e.status === 401 ? logout() : setFatal(e)))
  }, [token, logout])

  // Всё по выбранной карте
  useEffect(() => {
    if (!mapId) return
    setSelectedId(null); setSelPointId(null); setSelPanoId(null); setSelectedDoorId(null)
    Promise.all([api.listFloors(mapId), api.getBuilding(mapId), api.listRooms(mapId), api.listNodes(mapId), api.listPanos(mapId)])
      .then(([fl, b, rs, ns, ps]) => {
        setFloors(fl); setBuilding(b); setRooms(rs); setNodes(ns); setPanos(ps)
        setFloorId((cur) => (fl.some((f) => f.id === cur) ? cur : fl[0]?.id ?? null))
        const slug = maps?.find((m) => m.id === mapId)?.slug
        if (slug) {
          const url = new URL(window.location.href)
          url.searchParams.set('map', slug)
          window.history.replaceState(null, '', url)
        }
      })
      .catch((e) => (e.status === 401 ? logout() : setFatal(e)))
  }, [mapId]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- помещения: отложенное сохранение ---
  const flush = useCallback(async () => {
    const items = Object.entries(pending.current)
    pending.current = {}
    if (!items.length) return
    setSave({ state: 'saving' })
    try {
      for (const [id, patch] of items) {
        const saved = await api.patchRoom(mapIdRef.current, id, patch)
        setRooms((rs) => rs.map((r) => (r.id === id ? { ...saved, ...(pending.current[id] ?? {}) } : r)))
      }
      setSave({ state: Object.keys(pending.current).length ? 'saving' : 'saved' })
    } catch (e) { handleError(e) }
  }, [handleError])

  const queuePatch = useCallback((id, patch, delay = 450) => {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    pending.current[id] = { ...(pending.current[id] ?? {}), ...patch }
    setSave({ state: 'pending' })
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [flush])

  // --- точки и двери: отложенное сохранение ---
  const flushNodes = useCallback(async () => {
    const items = Object.values(pendingNodes.current)
    pendingNodes.current = {}
    if (!items.length) return
    setSave({ state: 'saving' })
    try {
      for (const n of items) {
        const body = {
          floor_id: n.floor_id,
          type: n.type,
          name: n.name,
          description: n.description ?? null,
          category: n.category ?? null,
          x: n.x,
          y: n.y,
          panorama_id: n.panorama_id ?? null,
          meta: n.meta || {},
        }
        const saved = await api.patchNode(mapIdRef.current, n.id, body)
        setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...saved, ...(pendingNodes.current[n.id] ?? {}) } : x)))
      }
      setSave({ state: 'saved' })
    } catch (e) { handleError(e) }
  }, [handleError])

  const queueNode = useCallback((id, patch, delay = 400) => {
    setNodes((ns) => {
      const next = ns.map((n) => (n.id === id ? { ...n, ...patch } : n))
      pendingNodes.current[id] = next.find((n) => n.id === id)
      return next
    })
    setSave({ state: 'pending' })
    clearTimeout(nodeTimer.current)
    nodeTimer.current = setTimeout(flushNodes, delay)
  }, [flushNodes])

  useEffect(() => {
    const beforeUnload = (e) => {
      if (Object.keys(pending.current).length || Object.keys(pendingNodes.current).length) e.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const busy = async (fn) => {
    setSave({ state: 'saving' })
    try { const r = await fn(); setSave({ state: 'saved' }); return r } catch (e) { handleError(e); return undefined }
  }

  // --- управление мероприятиями (картами) ---
  const handleCreateMap = async (title, address) => {
    const m = await busy(() => api.createMap(title, address))
    if (m) {
      await api.createFloor(m.id, '1 этаж', 1)
      await api.putBuilding(m.id, { width_m: 50, height_m: 35 })
      setMaps((prev) => [m, ...(prev || [])])
      setMapId(m.id)
      setViewMode('editor')
    }
  }

  const handleDeleteMap = async (id) => {
    const ok = await busy(() => api.deleteMap(id).then(() => true))
    if (ok) {
      setMaps((prev) => prev.filter((m) => m.id !== id))
      if (mapId === id) {
        setMapId(null)
        setViewMode('dashboard')
      }
    }
  }

  // --- помещения ---
  const handleCreateRoomFromArea = async (roomData) => {
    const r = await busy(() => api.createRoom(mapId, {
      floor_id: floorId,
      ...roomData,
    }))
    if (r) {
      setRooms((rs) => [...rs, r])
      setSelectedId(r.id)
      setSelectedDoorId(null)
    }
  }

  const removeRoom = async (id) => {
    clearTimeout(timer.current)
    delete pending.current[id]
    await flush()
    const ok = await busy(() => api.deleteRoom(mapId, id).then(() => true))
    if (ok) { setRooms((rs) => rs.filter((r) => r.id !== id)); setSelectedId(null) }
  }

  const changeBuilding = async (patch) => {
    const next = { ...building, ...patch }
    setBuilding(next)
    await flush()
    await busy(async () => {
      await api.putBuilding(mapId, next)
      setRooms(await api.listRooms(mapId))
    })
  }

  const addFloor = async () => {
    const level = Math.max(0, ...floors.map((f) => f.level)) + 1
    const f = await busy(() => api.createFloor(mapId, `${level} этаж`, level))
    if (f) { setFloors((fl) => [...fl, f]); setFloorId(f.id); setSelectedId(null); setSelectedDoorId(null) }
  }

  const uploadPlan = async (file) => {
    const form = new FormData()
    form.append('file', file)
    form.append('fit_building', 'true')
    const res = await busy(() => api.uploadPlan(mapId, floorId, form, (k) => setSave({ state: 'saving', message: `Загружаем план… ${Math.round(k * 100)}%` })))
    if (res) {
      setFloors((fl) => fl.map((f) => (f.id === floorId ? { ...f, plan_image_key: res.plan_url.replace(/^\/files\//, ''), width: res.width, height: res.height } : f)))
      setBuilding(res.building)
      setRooms(await api.listRooms(mapId))
    }
  }
  const removePlan = async () => {
    const ok = await busy(() => api.deletePlan(mapId, floorId).then(() => true))
    if (ok) setFloors((fl) => fl.map((f) => (f.id === floorId ? { ...f, plan_image_key: null } : f)))
  }

  // --- двери ---
  const placeDoor = async (pos) => {
    setPlacing(null)
    const d = await busy(() => api.createNode(mapId, {
      floor_id: floorId,
      type: 'door',
      name: 'Дверь',
      x: pos.x,
      y: pos.y,
      meta: { door_type: 'single', width_m: 1.0, angle: 0, swing: 'left' },
    }))
    if (d) {
      setNodes((ns) => [...ns, d])
      setSelectedDoorId(d.id)
      setSelectedId(null)
    }
  }

  const handleUpdateDoor = (id, patch) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch, meta: { ...(n.meta || {}), ...(patch.meta || {}) } } : n)))
    const cur = nodes.find((n) => n.id === id)
    if (!cur) return
    const merged = { ...cur, ...patch, meta: { ...(cur.meta || {}), ...(patch.meta || {}) } }
    queueNode(id, merged)
  }

  const handleDeleteDoor = async (id) => {
    const ok = await busy(() => api.deleteNode(mapId, id).then(() => true))
    if (ok) {
      setNodes((ns) => ns.filter((n) => n.id !== id))
      setSelectedDoorId(null)
    }
  }

  const handleMoveDoor = (id, pos, isFinal) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...pos } : n)))
    if (isFinal) {
      const cur = nodes.find((n) => n.id === id)
      if (cur) queueNode(id, { ...cur, ...pos })
    }
  }

  // --- точки POI ---
  const placePoint = async ({ x, y }) => {
    setPlacing(null)
    const n = await busy(() => api.createNode(mapId, {
      floor_id: floorId, type: 'poi', name: 'Новая точка', category: 'stand', x, y,
    }))
    if (n) { setNodes((ns) => [...ns, n]); setSelPointId(n.id) }
  }
  const removePoint = async (id) => {
    clearTimeout(nodeTimer.current)
    delete pendingNodes.current[id]
    const ok = await busy(() => api.deleteNode(mapId, id).then(() => true))
    if (ok) { setNodes((ns) => ns.filter((n) => n.id !== id)); setSelPointId(null) }
  }

  // --- панорамы ---
  const replacePano = (p) => setPanos((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]))
  const patchPano = async (id, patch) => {
    const p = await busy(() => api.patchPano(mapId, id, patch))
    if (p) replacePano(p)
  }
  const removePano = async (id) => {
    const ok = await busy(() => api.deletePano(mapId, id).then(() => true))
    if (ok) { setPanos((ps) => ps.filter((p) => p.id !== id)); setSelPanoId(null) }
  }

  const onMoveMarker = (kind, id, pos, commit) => {
    if (kind === 'point') {
      if (commit) queueNode(id, pos, 150)
      else setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...pos } : n)))
    } else {
      setPanos((ps) => ps.map((p) => (p.id === id ? { ...p, ...pos } : p)))
      if (commit) patchPano(id, pos)
    }
  }

  const publish = async () => {
    const map = maps.find((m) => m.id === mapId)
    const ok = await busy(() => api.publishMap(map.slug).then(() => true))
    if (ok) setMaps((ms) => ms.map((m) => (m.id === mapId ? { ...m, status: 'published' } : m)))
  }

  // --- производные данные ---
  const roomNodeIds = useMemo(() => new Set(rooms.map((r) => r.node_id).filter(Boolean)), [rooms])
  const points = useMemo(() => nodes.filter((n) => n.type !== 'corridor' && n.type !== 'viewpoint' && n.type !== 'door' && !roomNodeIds.has(n.id)), [nodes, roomNodeIds])
  const floorRooms = useMemo(() => rooms.filter((r) => r.floor_id === floorId), [rooms, floorId])
  const floorPoints = points.filter((p) => p.floor_id === floorId)
  const floorPanos = panos.filter((p) => p.floor_id === floorId && p.x != null)
  const selected = floorRooms.find((r) => r.id === selectedId)
  const selPoint = floorPoints.find((p) => p.id === selPointId)
  const selPano = panos.find((p) => p.id === selPanoId)
  const selectedDoor = nodes.find((n) => n.id === selectedDoorId && n.type === 'door')
  const setupPano = panos.find((p) => p.id === setupId)
  const map = maps?.find((m) => m.id === mapId)
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level)
  const floor = floors.find((f) => f.id === floorId)

  // --- экраны ---
  if (!token) return <Login onLoggedIn={(t) => { api.setToken(t); setTok(t) }} />

  if (fatal) {
    return (
      <Centered>
        <div className="max-w-md rounded-2xl bg-white p-6 ring-1 ring-line">
          <h1 className="text-xl font-extrabold">{fatal.offline ? 'Сервер карты не отвечает' : 'Не удалось открыть редактор'}</h1>
          <p className="mt-2 text-ink-soft">{fatal.offline ? 'Запустите бэкенд (uvicorn) и обновите страницу.' : fatal.message}</p>
          <button type="button" onClick={() => window.location.reload()} className={`mt-5 ${primaryCls}`}>Обновить</button>
        </div>
      </Centered>
    )
  }

  // Если открыт режим дашборда (карточки всех мероприятий) или карты ещё не загружены/не выбраны
  if (viewMode === 'dashboard' || !mapId || (maps && maps.length === 0)) {
    return (
      <MapsDashboard
        maps={maps || []}
        onSelectMap={(id) => {
          setMapId(id)
          setViewMode('editor')
        }}
        onCreateMap={handleCreateMap}
        onDeleteMap={handleDeleteMap}
        onLogout={logout}
      />
    )
  }

  if (!map || !building || !floor) {
    return <Centered><p className="animate-pulse font-semibold text-ink-soft">Открываем координатную сетку…</p></Centered>
  }

  const saveText = save.message && save.state === 'saving' ? save.message : {
    idle: 'Изменения сохраняются автоматически',
    pending: 'Есть несохранённые изменения',
    saving: 'Сохраняем…',
    saved: 'Все изменения сохранены',
    error: save.message,
  }[save.state]

  const listRooms = [...floorRooms].sort((a, b) => Number(isCorridor(a)) - Number(isCorridor(b)) || a.name.localeCompare(b.name, 'ru'))
  const usedArea = floorRooms.filter((r) => !isCorridor(r)).reduce((s, r) => s + r.w * r.h, 0) * building.width_m * building.height_m
  const planUrl = floor.plan_image_key ? fileUrl(`/files/${floor.plan_image_key}`) : null

  const switchTab = (t) => {
    setTab(t); setPlacing(null)
    setSelectedId(null); setSelPointId(null); setSelPanoId(null); setSelectedDoorId(null)
  }

  const floorsBar = (
    <section aria-labelledby="floors-title" className="flex flex-col gap-2">
      <h2 id="floors-title" className="text-sm font-semibold text-ink-soft">Этаж</h2>
      <div className="flex flex-wrap gap-2">
        {sortedFloors.map((f) => (
          <button key={f.id} type="button" onClick={() => { setFloorId(f.id); setSelectedId(null); setSelPointId(null); setSelPanoId(null); setSelectedDoorId(null) }}
            aria-current={f.id === floorId ? 'true' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              f.id === floorId ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-line hover:ring-ink'}`}>
            {f.name}
          </button>
        ))}
        {tab === 'rooms' && (
          <button type="button" onClick={addFloor}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-white hover:text-ink">
            <Icon d={ICONS.plus} className="size-4" /> Этаж
          </button>
        )}
      </div>
    </section>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-plaster lg:h-dvh lg:flex-row">
      {/* Боковая панель управления */}
      <aside className="order-2 flex flex-col gap-5 p-5 lg:order-1 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line lg:p-6 bg-white">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className="flex items-center gap-1.5 text-xs font-bold text-[#7A8594] hover:text-[#1C2430] py-1 px-2 rounded-lg hover:bg-[#F6F7F9] transition"
            >
              <span>← Все мероприятия</span>
            </button>
            <span className="text-xs font-semibold text-[#7A8594]">
              {floor.name}
            </span>
          </div>

          <div>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[#1C2430]">
              {map.title}
            </h1>
            {map.address && (
              <p className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[#7A8594]">
                <svg className="size-3.5 text-[#1C2430] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="truncate">{map.address}</span>
              </p>
            )}
          </div>

          <p role="status" className={`text-xs ${save.state === 'error' ? 'font-semibold text-alert' : 'text-ink-soft'}`}>
            {saveText}
          </p>
        </header>

        <nav aria-label="Разделы редактора" className="flex gap-1 rounded-xl bg-[#F6F7F9] p-1 ring-1 ring-line">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => switchTab(k)} aria-current={tab === k ? 'page' : undefined}
              className={`flex-auto rounded-lg px-1.5 py-2 text-[13px] font-bold transition ${tab === k ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </nav>

        {/* ---------- Настройка двери ---------- */}
        {selectedDoor && (
          <DoorSettings
            door={selectedDoor}
            building={building}
            onChange={handleUpdateDoor}
            onDelete={handleDeleteDoor}
            onClose={() => setSelectedDoorId(null)}
          />
        )}

        {/* ---------- Помещения ---------- */}
        {tab === 'rooms' && !selectedDoor && (selected ? (
          <RoomForm room={selected} building={building}
            onChange={(id, patch) => queuePatch(id, patch, 150)} onDelete={removeRoom} onClose={() => setSelectedId(null)} />
        ) : (
          <>
            {floorsBar}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowAddRoom(true)}
                className={`${bigYellow} bg-signal text-ink shadow-[0_2px_0_#1C2430] hover:bg-[#ffd04d]`}
              >
                <Icon d={ICONS.plus} /> Добавить помещение
              </button>

              <button
                type="button"
                onClick={() => setPlacing(placing === 'door' ? null : 'door')}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold border transition ${
                  placing === 'door'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300'
                    : 'bg-white text-[#1C2430] border-[#E3E7EC] hover:bg-[#F6F7F9]'
                }`}
              >
                <span>🚪 {placing === 'door' ? 'Режим двери активен' : '+ Добавить дверь'}</span>
              </button>
            </div>

            <section aria-labelledby="rooms-title">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="rooms-title" className="text-sm font-semibold text-ink-soft">Помещения, {floor.name}</h2>
                <span className="text-sm tabular-nums text-ink-soft">{fmt(usedArea, 0)} м² без коридоров</span>
              </div>
              {listRooms.length === 0 ? (
                <p className="rounded-xl bg-[#F6F7F9] px-4 py-3 text-[14px] text-ink-soft border border-[#E3E7EC]">
                  На этаже пока пусто. Нажмите «+ Добавить помещение» — задайте площадь, на сетке появится фигура с вершинами для деформации.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 max-h-[36vh] overflow-y-auto pr-1">
                  {listRooms.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => { setSelectedId(r.id); setSelectedDoorId(null) }}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-[#F6F7F9] ${selectedId === r.id ? 'bg-[#FFC627]/20 ring-1 ring-[#FFC627]' : ''}`}>
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${isCorridor(r) ? 'bg-corridor text-ink-soft' : 'bg-ink text-white'}`}>
                          {isCorridor(r) ? <span className="block h-1.5 w-4 rounded-full bg-ink-soft/50" /> : <PoiIcon node={r} className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-ink-soft">
                          {r.points ? `${fmt(r.points.length)} углов` : ''} · {fmt(r.w * building.width_m * r.h * building.height_m, 0)} м²
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="plan-title" className="flex flex-col gap-2">
              <h2 id="plan-title" className="text-sm font-semibold text-ink-soft">Готовый план этажа</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => planInput.current?.click()}
                  className="rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-line hover:ring-ink">
                  {planUrl ? 'Заменить картинку плана' : 'Загрузить план (PNG, JPG)'}
                </button>
                {planUrl && (
                  <button type="button" onClick={removePlan} className="rounded-lg px-3 py-2 text-sm font-semibold text-alert hover:bg-alert/10">Убрать</button>
                )}
              </div>
              {planUrl && (
                <label className="flex items-center gap-3 text-sm text-ink-soft">
                  Прозрачность подложки
                  <input type="range" min="0.15" max="1" step="0.05" value={planOpacity} onChange={(e) => setPlanOpacity(Number(e.target.value))} className="flex-1 accent-[#1C2430]" />
                </label>
              )}
              <input ref={planInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPlan(f) }} />
            </section>

            <section aria-labelledby="building-title" className="flex flex-col gap-2">
              <h2 id="building-title" className="text-sm font-semibold text-ink-soft">Габариты здания</h2>
              <div className="grid grid-cols-2 gap-3">
                <NumberField id="b-w" label="Ширина" suffix="м" value={building.width_m} min={5} max={2000} onCommit={(v) => changeBuilding({ width_m: v })} />
                <NumberField id="b-h" label="Глубина" suffix="м" value={building.height_m} min={5} max={2000} onCommit={(v) => changeBuilding({ height_m: v })} />
              </div>
            </section>
          </>
        ))}

        {/* ---------- Точки ---------- */}
        {tab === 'points' && !selectedDoor && (selPoint ? (
          <PointForm point={selPoint} onChange={(id, patch) => queueNode(id, patch, 150)} onDelete={removePoint} onClose={() => setSelPointId(null)} />
        ) : (
          <>
            {floorsBar}
            <button type="button" onClick={() => setPlacing(placing === 'point' ? null : 'point')}
              className={`${bigYellow} ${placing === 'point' ? 'bg-ink text-white ring-signal' : 'bg-signal text-ink shadow-[0_2px_0_#1C2430] hover:bg-[#ffd04d]'}`}>
              <Icon d={ICONS.plus} /> {placing === 'point' ? 'Кликните на плане…' : 'Добавить точку'}
            </button>
            <section aria-labelledby="pts-title">
              <h2 id="pts-title" className="mb-2 text-sm font-semibold text-ink-soft">Точки на этаже ({floorPoints.length})</h2>
              {floorPoints.length === 0 ? (
                <p className="rounded-xl bg-white px-4 py-3 text-[15px] text-ink-soft ring-1 ring-line">
                  Точки отмечают стенды, сервисы, банкоматы, входы и выходы.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
                  {floorPoints.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSelPointId(p.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white">
                        <PoiIcon node={p} className="size-5 shrink-0 text-ink" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                        <span className="shrink-0 text-xs text-ink-soft">{categoryLabel(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ))}

        {/* ---------- Панорамы ---------- */}
        {tab === 'panos' && !selectedDoor && (
          <>
            {!selPano && floorsBar}
            <PanoPanel
              panos={floorPanos}
              selected={selPano}
              onSelect={setSelPanoId}
              placing={placing === 'pano'}
              onAdd={() => setPlacing(placing === 'pano' ? null : 'pano')}
              onRename={(name) => patchPano(selPano.id, { name })}
              onOpenSetup={() => setSetupId(selPano.id)}
              onDelete={() => removePano(selPano.id)}
            />
          </>
        )}

        {/* ---------- Публикация ---------- */}
        {tab === 'publish' && !selectedDoor && <PublishPanel map={map} onPublish={publish} />}

        <footer className="mt-auto flex items-center justify-between gap-3 pt-2 text-xs font-semibold">
          <a href={`/?map=${encodeURIComponent(map.slug)}`} target="_blank" rel="noreferrer"
            className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">Экран посетителя ↗</a>
          <button type="button" onClick={logout} className="text-ink-soft hover:text-ink">Выйти</button>
        </footer>
      </aside>

      {/* Координатная сетка и интерактивный редактор */}
      <main className="relative order-1 h-[62vh] min-h-[380px] shrink-0 lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink bg-[#F6F7F9]">
        <div className="absolute inset-0">
          <PlanEditor
            rooms={floorRooms}
            building={building}
            selectedId={selectedId}
            nodes={nodes}
            selectedDoorId={selectedDoorId}
            onSelect={(id) => {
              setSelectedId(id)
              if (id) setSelectedDoorId(null)
            }}
            onSelectDoor={(doorId) => {
              setSelectedDoorId(doorId)
              if (doorId) setSelectedId(null)
            }}
            onPreview={(id, geom) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...geom } : r)))}
            onCommit={(id, geom) => queuePatch(id, geom, 250)}
            onMoveDoor={handleMoveDoor}
            mode={tab === 'publish' ? 'view' : tab}
            planUrl={planUrl}
            planOpacity={planOpacity}
            points={floorPoints}
            viewpoints={floorPanos}
            selectedPointId={selPointId}
            selectedPanoId={selPanoId}
            onSelectPoint={setSelPointId}
            onSelectPano={setSelPanoId}
            onMoveMarker={onMoveMarker}
            placing={placing}
            onPlace={(pos) => {
              if (placing === 'door') placeDoor(pos)
              else if (placing === 'point') placePoint(pos)
              else if (placing === 'pano') { setPlacing(null); setAddSpot(pos) }
            }}
            snapToGrid={snapToGrid}
            onToggleSnap={toggleSnap}
            onAddRoomClick={() => setShowAddRoom(true)}
            onAddDoorClick={() => setPlacing(placing === 'door' ? null : 'door')}
          />
        </div>
      </main>

      {/* Диалог добавления помещения по площади */}
      <AddRoomDialog
        isOpen={showAddRoom}
        onClose={() => setShowAddRoom(false)}
        onCreate={handleCreateRoomFromArea}
        building={building}
      />

      {addSpot && (
        <AddPanoDialog mapId={mapId} floorId={floorId} spot={addSpot}
          onCancel={() => setAddSpot(null)}
          onCreated={(p) => { setAddSpot(null); replacePano(p); setSelPanoId(p.id); setSetupId(p.id) }} />
      )}
      {setupPano && (
        <PanoSetup mapId={mapId} pano={setupPano}
          data={{ nodes: places, panoramas: panos, building }}
          onChange={replacePano} onClose={() => setSetupId(null)} />
      )}
    </div>
  )
}
