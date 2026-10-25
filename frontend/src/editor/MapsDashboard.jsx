import React, { useState } from 'react'

export default function MapsDashboard({
  maps = [],
  onSelectMap,
  onCreateMap,
  onDeleteMap,
  onLogout,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreateMap(title.trim(), address.trim())
      setShowCreateModal(false)
      setTitle('')
      setAddress('')
    } catch (err) {
      setError(err.message || 'Ошибка создания карты')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#F6F7F9] flex flex-col">
      {/* Шапка дашборда организатора */}
      <header className="bg-white border-b border-[#E3E7EC] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-[#1C2430] text-[#FFC627] font-bold">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#1C2430] tracking-tight">
                Панель организатора
              </h1>
              <p className="text-xs font-semibold text-[#7A8594]">
                Управление картами мероприятий и планами площадок
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(true)
                setError(null)
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C2430] text-white text-xs font-bold hover:bg-[#2b3646] transition shadow-sm"
            >
              <span className="text-[#FFC627] text-base leading-none font-black">+</span>
              <span>Создать карту мероприятия</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-[#7A8594] hover:text-[#1C2430] hover:bg-[#E3E7EC]/50 transition"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Основной контент со списком карточек */}
      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-[#1C2430] tracking-tight">
              Ваши мероприятия
            </h2>
            <p className="text-sm font-medium text-[#7A8594]">
              Выберите мероприятие для редактирования схемы помещений или создайте новое
            </p>
          </div>
          <span className="text-xs font-bold text-[#7A8594] bg-white px-3 py-1.5 rounded-xl border border-[#E3E7EC]">
            Всего: {maps.length}
          </span>
        </div>

        {maps.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-[#E3E7EC] shadow-sm">
            <div className="size-16 rounded-2xl bg-[#F6F7F9] flex items-center justify-center text-[#7A8594] mb-4">
              <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#1C2430] mb-1">
              У вас пока нет созданных карт
            </h3>
            <p className="text-sm text-[#7A8594] max-w-md mb-5">
              Создайте первую карту события, указав адрес площадки и название. Откроется чистое координатное поле для черчения.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-3 rounded-2xl bg-[#1C2430] text-white text-sm font-bold hover:bg-[#2b3646] transition shadow-md"
            >
              + Создать мероприятие
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {maps.map((m) => {
              const isDeleting = confirmDeleteId === m.id
              return (
                <div
                  key={m.id}
                  className="group relative flex flex-col justify-between p-6 rounded-3xl bg-white border border-[#E3E7EC] hover:border-[#1C2430]/30 hover:shadow-xl transition-all duration-200"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#FFC627]/20 text-[#1C2430]">
                        <span className="size-1.5 rounded-full bg-[#1C2430]" />
                        {m.status === 'published' ? 'Опубликована' : 'Черновик'}
                      </span>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(isDeleting ? null : m.id)}
                        className="text-xs font-semibold text-[#7A8594] hover:text-red-600 transition"
                        title="Удалить карту"
                      >
                        ✕
                      </button>
                    </div>

                    <h3 className="text-xl font-extrabold text-[#1C2430] group-hover:text-black transition">
                      {m.title}
                    </h3>

                    {m.address ? (
                      <p className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#7A8594]">
                        <svg className="size-3.5 text-[#1C2430] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="line-clamp-2">{m.address}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-[#7A8594] italic">
                        Адрес не указан
                      </p>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#F0F2F5]">
                    {isDeleting ? (
                      <div className="flex items-center gap-2 animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteMap(m.id)
                            setConfirmDeleteId(null)
                          }}
                          className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition"
                        >
                          Удалить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-2 text-xs font-bold text-[#7A8594] hover:text-[#1C2430] bg-[#F6F7F9] rounded-xl"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#7A8594]">
                          {m.floors_count || 1} эт.
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectMap(m.id)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C2430] text-white text-xs font-bold hover:bg-[#2b3646] transition shadow-sm"
                        >
                          <span>Редактировать</span>
                          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Модальное окно создания нового мероприятия */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C2430]/65 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 bg-white rounded-3xl shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#1C2430]">
                  Новое мероприятие
                </h3>
                <p className="text-xs text-[#7A8594]">
                  Укажите название и адрес для создания схемы
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-[#7A8594] hover:text-[#1C2430] rounded-xl hover:bg-[#F6F7F9]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[#7A8594]">
                  Название мероприятия *
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: IT-Конференция 2026, Хакатон"
                  className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[#7A8594]">
                  Адрес площадки проведения *
                </span>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Например: г. Москва, ул. Академика Королева, 12"
                  className="px-3.5 py-2.5 rounded-xl border border-[#E3E7EC] text-sm text-[#1C2430] focus:ring-2 focus:ring-[#1C2430] outline-none"
                />
              </label>

              <div className="p-3 bg-[#F6F7F9] rounded-2xl text-xs text-[#7A8594] leading-relaxed">
                ℹ️ После создания сразу откроется пустое координатное поле с сеткой. Вы сможете добавлять помещения по площади, настраивать вершины и двери.
              </div>

              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-[#7A8594] hover:text-[#1C2430]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={busy || !title.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#1C2430] text-white text-xs font-extrabold hover:bg-[#2b3646] disabled:opacity-50 transition shadow-sm"
                >
                  {busy ? 'Создание…' : 'Создать и открыть редактор'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
