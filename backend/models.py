from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="sales")  # admin | technician | sales
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
    title = Column(String)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    status = Column(String, default="lead")  # lead | prospect | customer | inactive
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    direction = Column(String, nullable=False)  # inbound | outbound
    from_number = Column(String, nullable=False)
    to_number = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    contact = relationship("Contact")


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    type = Column(String, default="service")  # service | estimate | follow_up | install
    status = Column(String, default="scheduled")  # scheduled | confirmed | completed | cancelled | no_show
    notes = Column(Text)
    address = Column(String)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contact = relationship("Contact")
    technician = relationship("User", foreign_keys=[technician_id])


class JobAssignment(Base):
    __tablename__ = "job_assignments"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    status = Column(String, default="scheduled")  # scheduled | confirmed | in_progress | completed | cancelled
    priority = Column(String, default="normal")  # low | normal | high | urgent
    scheduled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    value = Column(Float, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contact = relationship("Contact")
    assignee = relationship("User", foreign_keys=[assigned_to])
    booking = relationship("Booking")
    technicians = relationship("JobTechnician", back_populates="job", cascade="all, delete-orphan")


class JobTechnician(Base):
    __tablename__ = "job_technicians"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("job_assignments.id", ondelete="CASCADE"), nullable=False)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("JobAssignment", back_populates="technicians")
    technician = relationship("User")


class TechnicianShift(Base):
    __tablename__ = "technician_shifts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    status = Column(String, default="available")  # confirmed | available

    user = relationship("User")


class TimeEntry(Base):
    __tablename__ = "time_entries"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    clock_in = Column(DateTime, nullable=False)
    clock_out = Column(DateTime, nullable=True)
    notes = Column(Text)
    job_id = Column(Integer, ForeignKey("job_assignments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    job = relationship("JobAssignment")
