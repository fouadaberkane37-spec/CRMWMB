from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, nullable=True)
    full_name = Column(String)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")  # admin | user | technician | sales
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    industry = Column(String)
    website = Column(String)
    phone = Column(String)
    address = Column(Text)
    city = Column(String)
    country = Column(String)
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contacts = relationship("Contact", back_populates="company")
    deals = relationship("Deal", back_populates="company")


class Contact(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String)
    email = Column(String, index=True)
    phone = Column(String)
    address = Column(Text)
    services = Column(Text)   # comma-separated, e.g. "window-ext,window-int,gutters"
    price = Column(Float)
    lat = Column(Float, nullable=True)   # geocoded from address
    lng = Column(Float, nullable=True)
    title = Column(String)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    status = Column(String, default="lead")  # lead | prospect | customer | inactive
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    company = relationship("Company", back_populates="contacts")
    deals = relationship("Deal", back_populates="contact")
    activities = relationship("Activity", back_populates="contact")


class Deal(Base):
    __tablename__ = "deals"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    value = Column(Float, default=0)
    stage = Column(String, default="lead")  # lead | qualified | proposal | negotiation | won | lost
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    expected_close_date = Column(DateTime, nullable=True)
    notes = Column(Text)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    job_status        = Column(String, default="todo")  # todo | payment_pending | done | cancelled
    reminder_sent     = Column(Boolean, default=False)   # tech 24h reminder sent
    reminder_sent_48h = Column(Boolean, default=False)   # tech 48h reminder sent
    client_reminder_sent = Column(Boolean, default=False)  # client 24h reminder sent
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contact = relationship("Contact", back_populates="deals")
    company = relationship("Company", back_populates="deals")
    activities = relationship("Activity", back_populates="deal")


class Knock(Base):
    __tablename__ = "knocks"
    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    address = Column(String)
    status = Column(String, default="knocked")  # knocked | answered | not_home | interested | not_interested
    notes = Column(Text)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contact = relationship("Contact")
    creator = relationship("User", foreign_keys=[created_by])


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=False)
    # NULL for inbound messages from customers (no CRM user involved)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    body = Column(Text, nullable=False)
    # "outbound" = sent by CRM agent, "inbound" = received from customer via SMS
    direction = Column(String, default="outbound", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    contact = relationship("Contact")
    sender = relationship("User")


class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, default="note")  # call | email | meeting | note | task
    title = Column(String, nullable=False)
    description = Column(Text)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    contact = relationship("Contact", back_populates="activities")
    deal = relationship("Deal", back_populates="activities")


class Invite(Base):
    __tablename__ = "invites"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=True, index=True)   # kept for legacy; nullable for phone invites
    phone = Column(String, nullable=True, index=True)
    full_name = Column(String, nullable=True)
    token = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, default="user")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    inviter = relationship("User", foreign_keys=[created_by])


class InboundLead(Base):
    """Unknown callers/texters — not yet in Contacts."""
    __tablename__ = "inbound_leads"
    id         = Column(Integer, primary_key=True, index=True)
    phone      = Column(String, nullable=False, unique=True)
    last_body  = Column(Text)
    source     = Column(String, default="sms")
    count      = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TechAvailability(Base):
    """Technician's declared availability for a given week."""
    __tablename__ = "tech_availability"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    week_start = Column(String, nullable=False)   # YYYY-MM-DD — Monday of the week
    mon        = Column(Boolean, default=False)
    tue        = Column(Boolean, default=False)
    wed        = Column(Boolean, default=False)
    thu        = Column(Boolean, default=False)
    fri        = Column(Boolean, default=False)
    sat        = Column(Boolean, default=False)
    sun        = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class ShiftConfirmation(Base):
    """A technician explicitly confirms they will be on-site on a specific date."""
    __tablename__ = "shift_confirmations"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    shift_date   = Column(String, nullable=False)   # YYYY-MM-DD
    confirmed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class ReminderLog(Base):
    """Audit log for every reminder SMS attempted."""
    __tablename__ = "reminder_logs"
    id             = Column(Integer, primary_key=True, index=True)
    deal_id        = Column(Integer, ForeignKey("deals.id"), nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    phone_number   = Column(String, nullable=True)
    status         = Column(String, default="sent")   # sent | failed | no_phone
    error          = Column(Text, nullable=True)
    sent_at        = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", foreign_keys=[deal_id])
    user = relationship("User", foreign_keys=[user_id])


class DealTechnician(Base):
    """Many-to-many: multiple technicians assigned to a single deal."""
    __tablename__ = "deal_technicians"
    id      = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class TimeClock(Base):
    __tablename__ = "timeclocks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    clock_type = Column(String, nullable=False)  # "in" | "out"
    clocked_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    deal = relationship("Deal", foreign_keys=[deal_id])


class OTPSession(Base):
    """Database-backed OTP sessions — works across multiple workers."""
    __tablename__ = "otp_sessions"
    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, nullable=False, index=True)
    username   = Column(String, nullable=False)
    otp        = Column(String, nullable=False)
    attempts   = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
