"""
Contact Lists API Router
=========================
CRUD + CSV upload for campaign phone number lists.
"""

import csv
import io
import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.database import get_db
from api.models.contact_list import ContactList

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/contact-lists", tags=["Contact Lists"])

E164_RE = re.compile(r"^\+?\d{10,15}$")


def _normalize_phone(raw: str) -> str | None:
    """Normalize phone number to E.164 format."""
    cleaned = re.sub(r"[\s\-\(\)]", "", raw.strip())
    if not cleaned:
        return None
    # Add India country code if 10-digit number
    if len(cleaned) == 10 and cleaned.isdigit():
        cleaned = "+91" + cleaned
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = "+" + cleaned
    elif not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    if E164_RE.match(cleaned):
        return cleaned
    return None


class CreateListRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    phone_numbers: list[str] = Field(default_factory=list)


class ListResponse(BaseModel):
    id: int
    name: str
    description: str | None
    total_count: int
    source: str
    is_active: bool
    created_at: str | None


class ListDetailResponse(ListResponse):
    phone_numbers: list[str]


def _to_response(r: ContactList) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "total_count": r.total_count,
        "source": r.source,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
    }


def _to_detail(r: ContactList) -> dict:
    return {**_to_response(r), "phone_numbers": r.phone_numbers or []}


# ── Create contact list (manual entry) ───────────────────────

@router.post("", response_model=ListResponse)
async def create_list(req: CreateListRequest, db: Session = Depends(get_db)):
    """Create a contact list with manually entered phone numbers."""
    normalized = []
    for raw in req.phone_numbers:
        num = _normalize_phone(raw)
        if num:
            normalized.append(num)

    # Deduplicate
    normalized = list(dict.fromkeys(normalized))

    record = ContactList(
        name=req.name,
        description=req.description,
        phone_numbers=normalized,
        total_count=len(normalized),
        source="manual",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info("Contact list created: %s (%d numbers)", req.name, len(normalized))
    return _to_response(record)


# ── Upload CSV ───────────────────────────────────────────────

@router.post("/upload-csv", response_model=ListResponse)
async def upload_csv(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
):
    """Upload a CSV file containing phone numbers.

    CSV should have a column named 'phone', 'mobile', 'number', or 'phone_number'.
    If no header matches, the first column is used.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Find phone column
    header = [h.strip().lower() for h in rows[0]]
    phone_col = None
    name_col = None
    for i, h in enumerate(header):
        if h in ("phone", "mobile", "number", "phone_number", "phonenumber", "contact"):
            phone_col = i
        if h in ("name", "contact_name", "full_name"):
            name_col = i

    # If no header match, check if first row looks like data
    if phone_col is None:
        if _normalize_phone(rows[0][0]):
            phone_col = 0
            data_rows = rows  # No header row
        else:
            phone_col = 0
            data_rows = rows[1:]
    else:
        data_rows = rows[1:]

    phone_numbers = []
    contacts_data = []
    skipped = 0

    for row in data_rows:
        if phone_col >= len(row):
            continue
        num = _normalize_phone(row[phone_col])
        if num:
            phone_numbers.append(num)
            contact = {"phone": num}
            if name_col is not None and name_col < len(row):
                contact["name"] = row[name_col].strip()
            contacts_data.append(contact)
        else:
            skipped += 1

    # Deduplicate
    seen = set()
    unique_phones = []
    unique_contacts = []
    for phone, contact in zip(phone_numbers, contacts_data):
        if phone not in seen:
            seen.add(phone)
            unique_phones.append(phone)
            unique_contacts.append(contact)

    if not unique_phones:
        raise HTTPException(status_code=400, detail="No valid phone numbers found in CSV")

    record = ContactList(
        name=name,
        description=description or f"Imported from {file.filename}",
        phone_numbers=unique_phones,
        contacts_data=unique_contacts,
        total_count=len(unique_phones),
        source="csv",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "CSV uploaded: %s — %d valid, %d skipped, %d duplicates removed",
        name, len(unique_phones), skipped, len(phone_numbers) - len(unique_phones),
    )
    return _to_response(record)


# ── List all contact lists ───────────────────────────────────

@router.get("", response_model=list[ListResponse])
async def list_contact_lists(db: Session = Depends(get_db)):
    """List all active contact lists."""
    rows = db.execute(
        select(ContactList)
        .where(ContactList.is_active.is_(True))
        .order_by(ContactList.created_at.desc())
    ).scalars().all()
    return [_to_response(r) for r in rows]


# ── Get contact list with phone numbers ──────────────────────

@router.get("/{list_id}", response_model=ListDetailResponse)
async def get_contact_list(list_id: int, db: Session = Depends(get_db)):
    """Get a contact list with all phone numbers."""
    row = db.execute(
        select(ContactList).where(ContactList.id == list_id, ContactList.is_active.is_(True))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Contact list not found")
    return _to_detail(row)


# ── Delete contact list ──────────────────────────────────────

@router.delete("/{list_id}")
async def delete_contact_list(list_id: int, db: Session = Depends(get_db)):
    """Soft-delete a contact list."""
    row = db.execute(
        select(ContactList).where(ContactList.id == list_id)
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Contact list not found")
    row.is_active = False
    db.commit()
    return {"message": "Contact list deleted", "id": list_id}
