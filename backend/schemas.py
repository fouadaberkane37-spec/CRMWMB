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
    email: str
    full_name: Optional[str] = None
    role: str = "sales"  # admin | technician | sales


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
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


class DealCreate(DealBase):
    pass


class DealUpdate(DealBase):
    title: Optional[str] = None


class Deal(DealBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    contact: Optional[Contact] = None
    company: Optional[Company] = None

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


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_contacts: int
    total_companies: int
    open_deals: int
    total_deal_value: float
    won_deals: int
    activities_today: int


# ── ChatMessage ───────────────────────────────────────────────────────────────
class ChatMessageBase(BaseModel):
    direction: str  # inbound | outbound
    from_number: str
    to_number: str
    body: str
    contact_id: Optional[int] = None


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageOut(ChatMessageBase):
    id: int
    is_read: bool
    sent_by: Optional[int]
    created_at: datetime
    contact: Optional[Contact] = None

    class Config:
        from_attributes = True


class ChatSend(BaseModel):
    to_number: str
    body: str
    contact_id: Optional[int] = None


class ConversationSummary(BaseModel):
    phone_number: str
    last_message: str
    last_message_at: datetime
    unread_count: int
    contact_id: Optional[int] = None
    contact_name: Optional[str] = None


# ── Booking ───────────────────────────────────────────────────────────────────
class BookingBase(BaseModel):
    title: str
    contact_id: Optional[int] = None
    technician_id: Optional[int] = None
    scheduled_at: datetime
    duration_minutes: int = 60
    type: str = "service"
    status: str = "scheduled"
    notes: Optional[str] = None
    address: Optional[str] = None


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    title: Optional[str] = None
    contact_id: Optional[int] = None
    technician_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    address: Optional[str] = None


class Booking(BookingBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    contact: Optional[Contact] = None
    technician: Optional[User] = None

    class Config:
        from_attributes = True


# ── JobTechnician ─────────────────────────────────────────────────────────────
class JobTechnicianOut(BaseModel):
    id: int
    job_id: int
    technician_id: int
    technician: Optional[User] = None

    class Config:
        from_attributes = True


# ── TechnicianShift ───────────────────────────────────────────────────────────
class TechnicianShiftBase(BaseModel):
    user_id: int
    date: str  # YYYY-MM-DD
    status: str = "available"  # confirmed | available


class TechnicianShiftCreate(TechnicianShiftBase):
    pass


class TechnicianShiftOut(TechnicianShiftBase):
    id: int
    user: Optional[User] = None

    class Config:
        from_attributes = True


# ── JobAssignment ─────────────────────────────────────────────────────────────
class JobAssignmentBase(BaseModel):
    title: str
    description: Optional[str] = None
    contact_id: Optional[int] = None
    assigned_to: Optional[int] = None
    booking_id: Optional[int] = None
    status: str = "scheduled"
    priority: str = "normal"
    scheduled_at: Optional[datetime] = None
    value: Optional[float] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class JobAssignmentCreate(JobAssignmentBase):
    pass


class JobAssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    contact_id: Optional[int] = None
    assigned_to: Optional[int] = None
    booking_id: Optional[int] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    value: Optional[float] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class JobAssignment(JobAssignmentBase):
    id: int
    completed_at: Optional[datetime]
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    contact: Optional[Contact] = None
    assignee: Optional[User] = None
    technicians: List[JobTechnicianOut] = []

    class Config:
        from_attributes = True


# ── TimeEntry ─────────────────────────────────────────────────────────────────
class TimeEntryBase(BaseModel):
    notes: Optional[str] = None
    job_id: Optional[int] = None


class TimeEntryClockIn(TimeEntryBase):
    pass


class TimeEntryClockOut(BaseModel):
    notes: Optional[str] = None


class TimeEntryOut(BaseModel):
    id: int
    user_id: int
    clock_in: datetime
    clock_out: Optional[datetime]
    notes: Optional[str]
    job_id: Optional[int]
    created_at: datetime
    user: Optional[User] = None

    class Config:
        from_attributes = True


# ── AppointmentReminder ───────────────────────────────────────────────────────
class ReminderOut(BaseModel):
    id: int
    job_id: Optional[int]
    contact_id: Optional[int]
    reminder_type: str
    phone_number: str
    message_body: Optional[str]
    status: str
    sent_at: datetime
    contact: Optional[Contact] = None

    class Config:
        from_attributes = True


class CampaignResult(BaseModel):
    sent: int
    skipped: int
    failed: int
    details: List[ReminderOut]
