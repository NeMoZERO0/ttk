import React, { useState, useMemo } from 'react'
import * as api from '../editor/editorApi.js'

export default function WelcomeModal({
  isOpen,
  onClose,
  maps = [],
  currentSlug,
  onSelectMap,
}) {
  const [selectedAddress, setSelectedAddress] = useState('all')
  const [search, setSearch] = useState('')
  const [showOrgAuth, setShowOrgAuth] = useState(false)
  const [customLoginMode, setCustomLoginMode] = useState(false)
  const [email, setEmail] = useState('demo@space-map.app')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState(null)
  const [authBusy, setAuthBusy] = useState(false)

  // Извлекаем уникальные адреса для фильтрации
  const addresses = useMemo(() => {
    const list = maps
      .map((m) => m.address?.trim())
      .filter(Boolean)
    return ['all', ...Array.from(new Set(list))]
  }, [maps])

  // Фильтрация мероприятий
  const filteredMaps = useMemo(() => {
    return (maps || []).filter((m) => {
      const matchAddr =
        selectedAddress === 'all' ||
        (m.address?.trim() || '').toLowerCase() === selectedAddress.toLowerCase()
      const q = search.trim().toLowerCase()
      const matchSearch =
        !q ||
        m.title.toLowerCase().includes(q) ||
        (m.address && m.address.toLowerCase().includes(q))
      return matchAddr && matchSearch
    })
  }, [maps, selectedAddress, search])

  if (!isOpen) return null

  const handleOrganizerLogin = async (e) => {
    e.preventDefault()
    setAuthBusy(true)
    setAuthError(null)

    try {
      const targetEmail = customLoginMode ? email.trim() : 'demo@space-map.app'
      const targetPass = password.trim()
      const res = await api.login(targetEmail, targetPass)
      if (res && res.access_token) {
        api.setToken(res.access_token)
        window.location.href = '/editor'
      } else {
        setAuthError('Не удалось получить ключ авторизации.')
      }
    } catch (err) {
      if (err.status === 401) {
        setAuthError('Неверный пароль организатора.')
      } else if (err.offline) {
        setAuthError('Сервер карты недоступен. Проверьте запуск бэкенда.')
      } else {
        setAuthError(err.message || 'Ошибка входа')
      }
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1C2430]/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl ring-1 ring-black/10 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E3E7EC] bg-[#FAFBFC]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-[#1C2430] text-[#FFC627] font-bold text-lg shadow-sm">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#1C2430] tracking-tight">
                Навигация по мероприятиям
              </h2>
              <p className="text-xs font-medium text-[#7A8594]">
                Выберите площадку и событие для просмотра карты
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Кнопка "Я организатор" */}
            <button
              type="button"
              onClick={() => {
                setShowOrgAuth(true)
                setAuthError(null)
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold bg-[#1C2430] text-white hover:bg-[#2b3646] transition shadow-sm"
              title="Перейти в панель управления и редактор"
            >
              <svg className="size-4 text-[#FFC627]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Я организатор</span>
            </button>

            {/* Закрыть окно, если уже выбрана какая-то карта */}
            {currentSlug && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-[#7A8594] hover:text-[#1C2430] hover:bg-[#E3E7EC]/50 rounded-xl transition"
                aria-label="Закрыть окно"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Панель фильтрации по адресу и строке поиска */}
        <div className="p-6 pb-4 border-b border-[#E3E7EC]/80 bg-white">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Поисковая строка */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#7A8594]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию или адресу события..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F6F7F9] border border-[#E3E7EC] text-sm text-[#1C2430] placeholder-[#7A8594] focus:outline-none focus:ring-2 focus:ring-[#1C2430] focus:bg-white transition"
              />
            </div>

            {/* Выбор адреса */}
            {addresses.length > 2 && (
              <div className="sm:w-64">
                <select
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F7F9] border border-[#E3E7EC] text-sm font-medium text-[#1C2430] focus:outline-none focus:ring-2 focus:ring-[#1C2430] focus:bg-white transition"
                >
                  <option value="all">Все доступные адреса</option>
                  {addresses
                    .filter((a) => a !== 'all')
                    .map((addr) => (
                      <option key={addr} value={addr}>
                        📍 {addr}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Быстрые теги адресов */}
          {addresses.length > 1 && (
            <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 text-xs">
              <span className="text-[#7A8594] font-medium shrink-0">Адрес:</span>
              <button
                type="button"
                onClick={() => setSelectedAddress('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition shrink-0 ${
                  selectedAddress === 'all'
                    ? 'bg-[#1C2430] text-white shadow-sm'
                    : 'bg-[#F6F7F9] text-[#7A8594] hover:bg-[#E3E7EC]'
                }`}
              >
                Все
              </button>
              {addresses
                .filter((a) => a !== 'all')
                .map((addr) => (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => setSelectedAddress(addr)}
                    className={`px-3 py-1 rounded-lg font-semibold transition shrink-0 max-w-[240px] truncate ${
                      selectedAddress === addr
                        ? 'bg-[#1C2430] text-white shadow-sm'
                        : 'bg-[#F6F7F9] text-[#7A8594] hover:bg-[#E3E7EC]'
                    }`}
                    title={addr}
                  >
                    📍 {addr}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Сетка карточек мероприятий */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#F6F7F9]/50">
          {filteredMaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex items-center justify-center size-14 rounded-2xl bg-white border border-[#E3E7EC] text-[#7A8594] mb-3 shadow-sm">
                <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-[#1C2430]">
                Мероприятий не найдено
              </h3>
              <p className="text-sm text-[#7A8594] max-w-sm mt-1">
                Попробуйте изменить поисковый запрос или фильтр по адресу.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMaps.map((m) => {
                const isCurrent = m.slug === currentSlug
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      onSelectMap(m.slug)
                      onClose()
                    }}
                    className={`group relative flex flex-col justify-between p-5 rounded-2xl bg-white border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
                      isCurrent
                        ? 'border-[#FFC627] ring-2 ring-[#FFC627]/40 shadow-md'
                        : 'border-[#E3E7EC] hover:border-[#1C2430]/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-[#FFC627]/20 text-[#1C2430]">
                          <span className="size-1.5 rounded-full bg-[#1C2430]" />
                          Событие
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[#1C2430] text-white">
                            Текущее
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-extrabold text-[#1C2430] group-hover:text-black transition">
                        {m.title}
                      </h3>

                      {m.address ? (
                        <p className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#7A8594]">
                          <svg className="size-3.5 text-[#1C2430] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span className="line-clamp-1">{m.address}</span>
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[#7A8594] italic">
                          Адрес площадки не указан
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#F0F2F5]">
                      <div className="flex items-center gap-3 text-xs font-semibold text-[#7A8594]">
                        <span>🏢 {m.floors_count || 1} эт.</span>
                        {m.rooms_count > 0 && <span>🚪 {m.rooms_count} помещ.</span>}
                      </div>

                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#1C2430] group-hover:translate-x-1 transition">
                        <span>Смотреть карту</span>
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Модальное окно авторизации организатора (поверх карточек) */}
        {showOrgAuth && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-[#1C2430]/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-md p-6 bg-white rounded-3xl shadow-2xl ring-1 ring-black/10">
              <button
                type="button"
                onClick={() => setShowOrgAuth(false)}
                className="absolute top-4 right-4 p-2 text-[#7A8594] hover:text-[#1C2430] rounded-xl"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center size-10 rounded-xl bg-[#1C2430] text-[#FFC627]">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#1C2430]">
                    Вход для организатора
                  </h3>
                  <p className="text-xs text-[#7A8594]">
                    Введите пароль для перехода в конструктор
                  </p>
                </div>
              </div>

              <form onSubmit={handleOrganizerLogin} className="flex flex-col gap-3.5">
                {customLoginMode && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-[#7A8594]">Email</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-[#7A8594]">
                    Пароль организатора
                  </span>
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder="Введите пароль..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
                  />
                </label>

                {authError && (
                  <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
                    {authError}
                  </p>
                )}

                {/* Подсказка для быстрого ввода */}
                <button
                  type="button"
                  onClick={() => {
                    setEmail('demo@space-map.app')
                    setPassword('demo123')
                  }}
                  className="text-left p-2.5 rounded-xl bg-[#F6F7F9] hover:bg-[#E3E7EC] text-xs text-[#7A8594] transition"
                >
                  🔑 Демо-пароль: <b className="text-[#1C2430]">demo123</b> (нажмите для автозаполнения)
                </button>

                <button
                  type="submit"
                  disabled={authBusy || !password.trim()}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1C2430] text-white font-bold text-sm hover:bg-[#2b3646] disabled:opacity-50 transition shadow-sm"
                >
                  {authBusy ? 'Проверка…' : 'Войти в панель организатора'}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomLoginMode(!customLoginMode)
                      setAuthError(null)
                    }}
                    className="font-semibold text-[#7A8594] hover:text-[#1C2430] underline"
                  >
                    {customLoginMode ? 'Стандартный вход' : 'Вход под другим email'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOrgAuth(false)}
                    className="font-semibold text-[#7A8594] hover:text-[#1C2430]"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
