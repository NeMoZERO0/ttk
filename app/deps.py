from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID
from app.database import get_db
from app.security import decode_token
from app.models import User

bearer = HTTPBearer(auto_error=False)

def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sub = decode_token(creds.credentials)
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.get(User, UUID(sub))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user