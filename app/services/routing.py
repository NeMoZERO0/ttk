import networkx as nx
from sqlalchemy.orm import Session
from uuid import UUID
from app.models import Node, Edge

def build_graph(map_id: UUID, db: Session) -> nx.Graph:
    g = nx.Graph()
    nodes = db.query(Node).filter_by(map_id=map_id).all()
    for n in nodes:
        g.add_node(str(n.id), x=n.x, y=n.y, floor_id=str(n.floor_id), type=n.type)
    edges = db.query(Edge).filter_by(map_id=map_id).all()
    for e in edges:
        a, b = str(e.from_node_id), str(e.to_node_id)
        # Для простоты используем nx.Graph (двусторонний)
        g.add_edge(a, b, weight=e.distance)
    return g

def shortest_path(map_id: UUID, a: UUID, b: UUID, db: Session) -> dict | None:
    g = build_graph(map_id, db)
    a, b = str(a), str(b)
    if a not in g or b not in g:
        return None
    try:
        path = nx.shortest_path(g, a, b, weight="weight")
        total = nx.path_weight(g, path, weight="weight")
    except nx.NetworkXNoPath:
        return None
        
    node_ids = [UUID(x) for x in path]
    nodes = {n.id: n for n in db.query(Node).filter(Node.id.in_(node_ids)).all()}
    
    return {
        "nodes": [
            {
                "id": str(nid),
                "x": nodes[nid].x, "y": nodes[nid].y,
                "floor_id": str(nodes[nid].floor_id),
                "name": nodes[nid].name,
                "type": nodes[nid].type,
                "panorama_id": str(nodes[nid].panorama_id) if nodes[nid].panorama_id else None,
            } for nid in node_ids
        ],
        "length": total,
        "panoramas": [str(nodes[nid].panorama_id) for nid in node_ids if nodes[nid].panorama_id],
    }