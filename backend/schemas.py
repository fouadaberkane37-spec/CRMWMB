from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str


# ── User ──────────────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    username: str = Field(..., max_length=64)
    email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=32)
    full_name: Optional[str] = Field(default=None, max_length=128)
    role: Literal["admin", "user", "technician", "sales"] = "user"


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=32)
    full_name: Optional[str] = Field(default=None, max_length=128)
    role: Optional[Literal["admin", "user", "technician", "sales"]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, max_length=128)


class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Company ───────────────────────────────────────────────────────────────────
class CompanyBase(BaseModel):
    name: str = Field(..., max_length=256)
    industry: Optional[str] = Field(default=None, max_length=128)
    website: Optional[str] = Field(default=None, max_length=512)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=512)
    city: Optional[str] = Field(default=None, max_length=128)
    country: Optional[str] = Field(default=None, max_length=128)
    notes: Optional[str] = Field(default=None, max_length=5000)


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(CompanyBase):
    name: Optional[str] = Field(default=None, max_length=256)


class Company(CompanyBase):
    id: int
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Contact ───────────────────────────────────────────────────────────────────
class ContactBase(BaseModel):
    first_name: str = Field(..., max_length=128)
    last_name: Optional[str] = Field(default=None, max_length=128)
    email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=300)
    services: Optional[str] = Field(default=None, max_length=512)
    price: Optional[float] = Field(default=None, ge=0)
    title: Optional[str] = Field(default=None, max_length=128)
    company_id: Optional[int] = None
    status: Literal["lead", "prospect", "customer", "inactive"] = "lead"
    notes: Optional[str] = Field(default=None, max_length=5000)


class ContactCreate(ContactBase):
    pass


class ContactUpdate(ContactBase):
    first_name: Optional[str] = Field(default=None, max_length=128)


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
    title: str = Field(..., max_length=256)
    value: float = Field(default=0, ge=0)
    stage: Literal["lead","qualified","proposal","negotiation","won","lost"] = "lead"
    contact_id: Optional[int] = None
    company_id: Optional[int] = None
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=5000)
    assigned_to: Optional[int] = None
    job_status: Literal["todo", "payment_pending", "done", "cancelled"] = "todo"


class DealCreate(DealBase):
    pass


class DealUpdate(DealBase):
    title: Optional[str] = Field(default=None, max_length=256)


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
    client_reminder_sent: bool = False
    contact: Optional[Contact] = None
    company: Optional[Company] = None
    assigned_techs: List[TechBasic] = []

    class Config:
        from_attributes = True


# ── Activity ──────────────────────────────────────────────────────────────────
class ActivityBase(BaseModel):
    type: Literal["call", "email", "meeting", "note", "task"] = "note"
    title: str = Field(..., max_length=256)
    description: Optional[str] = Field(default=None, max_length=5000)
    contact_id: Optional[int] = None
    deal_id: Optional[int] = None
    company_id: Optional[int] = None
    due_date: Optional[datetime] = None
    completed: bool = False


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(ActivityBase):
    title: Optional[str] = Field(default=None, max_length=256)
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
    address: Optional[str] = Field(default=None, max_length=300)
    status: Literal["knocked", "answered", "not_home", "interested", "not_interested"] = "knocked"
    notes: Optional[str] = Field(default=None, max_length=2000)
    contact_id: Optional[int] = None


class KnockCreate(KnockBase):
    pass


class KnockUpdate(BaseModel):
    address: Optional[str] = Field(default=None, max_length=300)
    status: Optional[Literal["knocked", "answered", "not_home", "interested", "not_interested"]] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
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
    body: str = Field(..., max_length=2000)


class ChatMessageOut(BaseModel):
    id: int
    contact_id: int
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    body: str
    direction: str = "outbound"
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
    phone: str = Field(..., max_length=32)
    full_name: str = Field(..., max_length=128)
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
    invite_url: Optional[str] = None

    class Config:
        from_attributes = True


class InviteAccept(BaseModel):
    username: str = Field(..., max_length=64)
    full_name: Optional[str] = Field(default=None, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)


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
    notes: Optional[str] = Field(default=None, max_length=500)


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
