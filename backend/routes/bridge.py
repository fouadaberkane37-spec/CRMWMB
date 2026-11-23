"""Blue work -> ZF CRM import bridge (admin only)."""
import json
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from bridge import bluework as bw

router = APIRouter(prefix="/api/bridge", tags=["bridge"])
MAX_BYTES = 10 * 1024 * 1024


async def _read(file: UploadFile, entity: str):
    if entity not in bw.ENTITIES:
        raise HTTPException(400, f"entity must be one of {', '.join(bw.ENTITIES)}")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "CSV too large (10 MB max)")
    headers, rows = bw.read_csv(data)
    if not headers:
        raise HTTPException(400, "CSV has no header row")
    return headers, rows


@router.post("/preview")
async def preview(file: UploadFile = File(...), entity: str = Form(...), mapping: str = Form(None),
                  _=Depends(require_admin)):
    headers, rows = await _read(file, entity)
    try:
        m = json.loads(mapping) if mapping else bw.guess_mapping(entity, headers)
    except ValueError:
        raise HTTPException(400, "mapping must be valid JSON")
    m = {k: v for k, v in m.items() if v}
    return {"entity": entity, "headers": headers, "fields": bw.FIELDS[entity], "mapping": m,
            "row_count": len(rows), "rows": bw.normalize_rows(entity, rows[:10], m),
            "raw_rows": rows[:10]}


@router.post("/import")
async def import_csv(file: UploadFile = File(...), entity: str = Form(...), mapping: str = Form(...),
                     dry_run: bool = Form(True), db: Session = Depends(get_db), _=Depends(require_admin)):
    headers, rows = await _read(file, entity)
    try:
        m = {k: v for k, v in json.loads(mapping).items() if v}
    except (ValueError, AttributeError):
        raise HTTPException(400, "mapping must be a JSON object {field: header}")
    bad = [v for v in m.values() if v not in headers]
    if bad:
        raise HTTPException(400, f"mapped columns not in CSV: {bad}")
    return bw.run_import(db, entity, rows, m, dry_run=dry_run)


@router.get("/status")
def status(db: Session = Depends(get_db), _=Depends(require_admin)):
    return bw.bridged_counts(db)
