from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    assert client.get("/health").json() == {"status": "ok"}

def test_full_flow():
    # 1. Регистрация
    r = client.post("/auth/register", json={"email": "test@test.com", "password": "123456"})
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    
    # 2. Создание карты
    m = client.post("/maps", json={"title": "Test Map"}, headers=h).json()
    map_id = m["id"]
    slug = m["slug"]
    
    # 3. Создание этажа
    f = client.post(f"/maps/{map_id}/floors", json={"name": "1F", "level": 0}, headers=h).json()
    
    # 4. Создание точек
    n1 = client.post(f"/maps/{map_id}/nodes", json={"floor_id": f["id"], "name": "A", "x": 0.1, "y": 0.1}, headers=h).json()
    n2 = client.post(f"/maps/{map_id}/nodes", json={"floor_id": f["id"], "name": "B", "x": 0.9, "y": 0.9}, headers=h).json()
    
    # 5. Соединение точек
    client.post(f"/maps/{map_id}/edges", json={"from_node_id": n1["id"], "to_node_id": n2["id"]}, headers=h)
    
    # 6. Публикация
    client.post(f"/public/maps/{slug}/publish", headers=h)  # публикация — только владельцем
    
    # 7. Проверка маршрута
    rt = client.post(f"/public/maps/{slug}/route", json={"from_node_id": n1["id"], "to_node_id": n2["id"]}).json()
    assert len(rt["nodes"]) == 2