from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str


# ── User ──────────────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "user"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Company ───────────────────────────────────────────────────────────────────
class CompanyBase(BaseModel):
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(CompanyBase):
    name: Optional[str] = None


class Company(CompanyBase):
    id: int
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Contact ───────────────────────────────────────────────────────────────────
class ContactBase(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    services: Optional[str] = None   # comma-separated service tags
    price: Optional[float] = None
    title: Optional[str] = None
    company_id: Optional[int] = None
    status: str = "lead"
    notes: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(ContactBase):
    first_name: Optional[str] = None


class Contact(ContactBase):
    id: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    company: Optional[Company] = None

    class Config:
        from_attributes = True


# ── Deal ──────────────────────────────────────────────────────────────────────
class DealBase(BaseModel):
    title: str
    value: float = 0
    stage: str = "lead"
    contact_id: Optional[int] = None
    company_id: Optional[int] = None
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None
    job_status: str = "todo"  # todo | payment_pending | done | cancelled


class DealCreate(DealBase):
    pass


class DealUpdate(DealBase):
    title: Optional[str] = None


class TechBasic(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    class Config:
        from_attributes = True

class Deal(DealBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    reminder_sent: bool = False
    reminder_sent_48h: bool = False
    contact: Optional[Contact] = None
    company: Optional[Company] = None
    assigned_techs: List[TechBasic] = []

    class Config:
        from_attributes = True


# ── Activity ──────────────────────────────────────────────────────────────────
class ActivityBase(BaseModel):
    type: str = "note"
    title: str
    description: Optional[str] = None
    contact_id: Optional[int] = None
    deal_id: Optional[int] = None
    company_id: Optional[int] = None
    due_date: Optional[datetime] = None
    completed: bool = False


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(ActivityBase):
    title: Optional[str] = None
    completed: Optional[bool] = None
    completed_at: Optional[datetime] = None


class Activity(ActivityBase):
    id: int
    completed_at: Optional[datetime]
    created_by: Optional[int]
    created_at: datetime
    contact: Optional[Contact] = None

    class Config:
        from_attributes = True


# ── Knock ─────────────────────────────────────────────────────────────────────
class KnockBase(BaseModel):
    lat: float
    lng: float
    address: Optional[str] = None
    status: str = "knocked"
    notes: Optional[str] = None
    contact_id: Optional[int] = None


class KnockCreate(KnockBase):
    pass


class KnockUpdate(BaseModel):
    address: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    contact_id: Optional[int] = None


class Knock(KnockBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    contact: Optional[Contact] = None

    class Config:
        from_attributes = True


# ── Chat ──────────────────────────────────────────────────────────────────────
class ChatMessageCreate(BaseModel):
    body: str


class ChatMessageOut(BaseModel):
    id: int
    contact_id: int
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    body: str
    direction: str = "outbound"  # "outbound" | "inbound"
    created_at: datetime

    class Config:
        from_attributes = True


class ChatConversation(BaseModel):
    contact_id: int
    contact_name: str
    last_message: Optional[str] = None
    last_at: Optional[datetime] = None
    unread: int = 0


# ── Invite ────────────────────────────────────────────────────────────────────
class InviteCreate(BaseModel):
    phone: str
    full_name: str
    role: str = "user"


class InviteOut(BaseModel):
    id: int
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None
    invite_url: Optional[str] = None  # populated by the endpoint, not from DB

    class Config:
        from_attributes = True


class InviteAccept(BaseModel):
    username: str
    full_name: Optional[str] = None
    password: str


class InviteCheck(BaseModel):
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    valid: bool


# ── UserBasic (non-admin public listing for team views) ───────────────────────
class UserBasic(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_contacts: int
    total_companies: int
    open_deals: int
    total_deal_value: float
    won_deals: int
    activities_today: int
    revenue_made: float = 0.0


# ── TimeClock ─────────────────────────────────────────────────────────────────
class TimeClockCreate(BaseModel):
    clock_type: str  # "in" | "out"
    deal_id: Optional[int] = None
    notes: Optional[str] = None


class TimeClockOut(BaseModel):
    id: int
    user_id: int
    username: str
    full_name: Optional[str]
    deal_id: Optional[int]
    deal_title: Optional[str]
    clock_type: str
    clocked_at: datetime
    notes: Optional[str]

    class Config:
        from_attributes = True
