"""Демо-данные для экрана посетителя.

Создаёт опубликованную карту со slug "demo": 2 этажа, комнаты и коридоры.
Точки в центрах комнат и граф маршрутов строятся автоматически (app/services/floorplan.py),
дальше план можно править в редакторе: http://localhost:5173/editor
(вход: demo@space-map.app / demo123).

Запуск вручную:  python -m app.seed
Автоматически вызывается при старте API (SEED_DEMO=true по умолчанию).
"""
DEMO_SLUG = "demo"
DEMO_TITLE = "Учебный корпус «А»"
DEMO_EMAIL = "demo@space-map.app"
DEMO_PASSWORD = "demo123"

# Габариты здания в метрах — для пересчёта нормированных координат (0..1) в длину рёбер
BUILDING_W_M = 60.0
BUILDING_H_M = 42.0

# Геометрия плана (доли от ширины/высоты), общая с SVG-заглушками
TOP_Y = (0.08, 0.42)
CORRIDOR_Y = 0.50
BOTTOM_Y = (0.58, 0.92)

# (название, тип узла, категория, x0, x1, описание)
DEMO_FLOORS = [
    {
        "level": 1,
        "name": "1 этаж",
        "top": [
            ("Главный вход", "entrance", "entrance", 0.05, 0.20, "Вход в корпус, турникеты и пост охраны. Пропуск понадобится на выходе."),
            ("Гардероб", "poi", "service", 0.20, 0.35, "Работает с 8:00 до 20:00. Номерок не теряйте — восстановление через администратора."),
            ("Столовая", "poi", "food", 0.35, 0.62, "Горячие обеды с 11:00 до 16:00, кофе и выпечка весь день."),
            ("Туалеты", "poi", "wc", 0.62, 0.80, "Мужской и женский, есть кабина для маломобильных посетителей."),
            ("Лестница", "stairs", "stairs", 0.80, 0.95, "Главная лестница, ведёт на 2 этаж."),
        ],
        "bottom": [
            ("Лифт", "elevator", "elevator", 0.05, 0.15, "Пассажирский лифт на все этажи."),
            ("Ресепшн", "poi", "info", 0.15, 0.32, "Справочная: расписание, пропуска, потерянные вещи."),
            ("Аудитория 101", "poi", "room", 0.32, 0.55, "Лекционная аудитория на 120 мест, проектор и микрофоны."),
            ("Аудитория 102", "poi", "room", 0.55, 0.75, "Семинарская аудитория на 40 мест."),
            ("Медпункт", "poi", "medical", 0.75, 0.95, "Первая помощь, будни с 9:00 до 18:00."),
        ],
    },
    {
        "level": 2,
        "name": "2 этаж",
        "top": [
            ("Библиотека", "poi", "library", 0.05, 0.32, "Читальный зал и выдача книг. Тихая зона."),
            ("Коворкинг", "poi", "cowork", 0.32, 0.58, "Столы для командной работы, розетки и Wi-Fi."),
            ("Деканат", "poi", "office", 0.58, 0.80, "Приём студентов: пн–пт, 10:00–17:00."),
            ("Лестница", "stairs", "stairs", 0.80, 0.95, "Главная лестница, ведёт на 1 этаж."),
        ],
        "bottom": [
            ("Лифт", "elevator", "elevator", 0.05, 0.15, "Пассажирский лифт на все этажи."),
            ("Аудитория 201", "poi", "room", 0.15, 0.40, "Компьютерный класс, 30 рабочих мест."),
            ("Аудитория 202", "poi", "room", 0.40, 0.62, "Аудитория для практических занятий."),
            ("Туалеты", "poi", "wc", 0.62, 0.75, "Мужской и женский."),
            ("Переговорная", "poi", "meeting", 0.75, 0.95, "Бронирование через деканат."),
        ],
    },
]


def _demo_rooms(fd: dict) -> list[dict]:
    """Комнаты этажа: два ряда помещений и коридор между ними."""
    rooms = []
    for side, (y0, y1) in (("top", TOP_Y), ("bottom", BOTTOM_Y)):
        for name, _ntype, cat, x0, x1, desc in fd[side]:
            rooms.append({"name": name, "category": cat, "description": desc,
                          "x": x0, "y": y0, "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)})
    rooms.append({"name": "Коридор", "category": "corridor", "description": None,
                  "x": 0.05, "y": TOP_Y[1], "w": 0.90, "h": round(BOTTOM_Y[0] - TOP_Y[1], 4)})
    return rooms


def _add_rooms(db, m, floor, fd) -> None:
    """Создаёт комнаты этажа. Если на этаже уже есть точка с тем же именем — привязывает её
    (так сохраняются id точек у демо-карты, созданной до появления редактора)."""
    from app.models import Node, Room
    from app.services.floorplan import sync_room_node

    existing = {n.name: n for n in db.query(Node).filter_by(map_id=m.id, floor_id=floor.id).all()
                if n.type != "corridor"}
    for rd in _demo_rooms(fd):
        r = Room(map_id=m.id, floor_id=floor.id, **rd)
        if rd["category"] != "corridor" and rd["name"] in existing:
            r.node_id = existing.pop(rd["name"]).id
        db.add(r)
        db.flush()
        sync_room_node(db, m, r)


# Схематичные демо-панорамы прошлой версии (уровень, название, x, y).
# Их больше не создаём; если они остались в базе — удаляем при старте.
_OLD_SYNTH_PANOS = [
    (1, "Холл у входа", 0.125, 0.50), (1, "Коридор, центр", 0.50, 0.50), (1, "Коридор у лестницы", 0.86, 0.50),
    (1, "Столовая", 0.45, 0.30), (1, "Аудитория 101", 0.40, 0.70), (2, "Коридор 2 этажа", 0.30, 0.50),
    (2, "Коридор у деканата", 0.70, 0.50), (2, "Библиотека", 0.15, 0.30), (2, "Коворкинг", 0.42, 0.30),
]


def _remove_old_synth_panoramas(db, m) -> int:
    from app.models import Floor, Node, Panorama
    from app.routers.media import remove_panorama
    from app.storage import delete_key

    levels = {f.id: f.level for f in db.query(Floor).filter_by(map_id=m.id).all()}
    removed, keys = 0, []
    for vp in db.query(Node).filter_by(map_id=m.id, type="viewpoint").all():
        match = any(levels.get(vp.floor_id) == lvl and vp.name == name and abs(vp.x - x) < 0.005 and abs(vp.y - y) < 0.005
                    for lvl, name, x, y in _OLD_SYNTH_PANOS)
        p = db.get(Panorama, vp.panorama_id) if vp.panorama_id else None
        if match and p:
            keys += remove_panorama(db, m, p)
            removed += 1
    if removed:
        db.commit()
        for k in keys:
            delete_key(k)
    return removed


def seed_demo(force: bool = False) -> str:
    """Создаёт демо-карту, если её ещё нет. Возвращает slug."""
    from app.database import SessionLocal
    from app.models import User, Map, Floor, Room
    from app.security import hash_password
    from app.services.floorplan import rebuild_map_graph, set_building_size

    db = SessionLocal()
    try:
        existing = db.query(Map).filter_by(slug=DEMO_SLUG).first()
        if existing and force:
            db.delete(existing)
            db.commit()
            existing = None

        if existing:
            s = dict(existing.settings or {})
            if "address" not in s:
                s["address"] = "г. Москва, Ленинградский просп., 39"
                existing.settings = s
                db.commit()
            # Демо-карта из прошлой версии — без комнат: достраиваем их
            if db.query(Room).filter_by(map_id=existing.id).first() is None:
                set_building_size(existing, BUILDING_W_M, BUILDING_H_M)
                floors = {f.level: f for f in db.query(Floor).filter_by(map_id=existing.id).all()}
                for fd in DEMO_FLOORS:
                    if fd["level"] in floors:
                        _add_rooms(db, existing, floors[fd["level"]], fd)
                rebuild_map_graph(db, existing)
                db.commit()
                print("Demo map: rooms added")
            removed = _remove_old_synth_panoramas(db, existing)
            if removed:
                print(f"Demo map: removed {removed} schematic panoramas")
            return DEMO_SLUG

        user = db.query(User).filter_by(email=DEMO_EMAIL).first()
        if not user:
            user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD), role="organizer")
            db.add(user)
            db.flush()

        m = Map(owner_id=user.id, title=DEMO_TITLE, slug=DEMO_SLUG, status="published",
                published_version=1, settings={"demo": True, "address": "г. Москва, Ленинградский просп., 39"})
        set_building_size(m, BUILDING_W_M, BUILDING_H_M)
        db.add(m)
        db.flush()

        for fd in DEMO_FLOORS:
            floor = Floor(map_id=m.id, level=fd["level"], name=fd["name"], width=1000, height=700)
            db.add(floor)
            db.flush()
            _add_rooms(db, m, floor, fd)

        rebuild_map_graph(db, m)  # коридоры, двери, лестницы и лифт между этажами
        db.commit()
        print(f"Demo map created: slug={DEMO_SLUG}")
        return DEMO_SLUG
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    seed_demo(force="--force" in sys.argv)
