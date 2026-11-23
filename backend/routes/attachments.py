"""Photos/files on jobs, customers and map pins (e.g. pictures of a customer's request).

Upload is idempotent by client_ref so the offline queue can retry safely.
Files are stored on disk in FILES_DIR (default: <repo>/data/uploads, git-ignored).
"""
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from routes.sync import resolve_ref

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

FILES_DIR = os.getenv("FILES_DIR") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads"))
MAX_BYTES = 15 * 1024 * 1024
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
           "image/heic": ".heic", "image/heif": ".heif", "application/pdf": ".pdf"}
OWNERS = {"job": models.Deal, "contact": models.Contact, "knock": models.Knock}


def _serialize(a: models.Attachment):
    return {"id": a.id, "owner_type": a.owner_type, "owner_id": a.owner_id, "caption": a.caption,
            "content_type": a.content_type, "size": a.size, "original_name": a.original_name,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "url": f"/api/attachments/{a.id}/file"}


@router.post("")
async def upload(
    owner_type: str = Form(...),
    owner_id: Optional[int] = Form(None),
    owner_client_ref: Optional[str] = Form(None),   # e.g. "<uuid>:deal" for a booking made offline
    client_ref: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if owner_type not in OWNERS:
        raise HTTPException(status_code=422, detail="owner_type must be job, contact or knock")
    if client_ref:
        existing = db.query(models.Attachment).filter(models.Attachment.client_ref == client_ref).first()
        if existing:
            return {**_serialize(existing), "duplicate": True}
    if not owner_id and owner_client_ref:
        owner_id = resolve_ref(db, owner_client_ref)
        if not owner_id:
            raise HTTPException(status_code=409, detail="Owner not synced yet")
    if not owner_id or not db.get(OWNERS[owner_type], owner_id):
        raise HTTPException(status_code=404, detail="Owner not found")

    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED:
        raise HTTPException(status_code=415, detail="Only photos (JPEG, PNG, WebP, HEIC) or PDF")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
    if not data:
        raise HTTPException(status_code=422, detail="Empty file")

    os.makedirs(FILES_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ALLOWED[ctype]}"
    with open(os.path.join(FILES_DIR, name), "wb") as fh:
        fh.write(data)
    a = models.Attachment(owner_type=owner_type, owner_id=owner_id, filename=name,
                          original_name=(file.filename or "")[:200] or None, content_type=ctype,
                          size=len(data), caption=(caption or None) and caption[:1000],
                          client_ref=client_ref, created_by=user.id)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {**_serialize(a), "duplicate": False}


@router.get("")
def list_attachments(owner_type: str, owner_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(models.Attachment)
            .filter(models.Attachment.owner_type == owner_type, models.Attachment.owner_id == owner_id)
            .order_by(models.Attachment.id).all())
    return [_serialize(a) for a in rows]


@router.get("/{attachment_id}/file")
def get_file(attachment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.get(models.Attachment, attachment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(FILES_DIR, os.path.basename(a.filename))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, media_type=a.content_type or "application/octet-stream")


@router.delete("/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.get(models.Attachment, attachment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role not in ("admin", "ceo") and a.created_by != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        os.remove(os.path.join(FILES_DIR, os.path.basename(a.filename)))
    except FileNotFoundError:
        pass
    db.delete(a)
    db.commit()
    return {"ok": True}
