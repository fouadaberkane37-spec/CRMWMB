import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { CalendarDays, User, MapPin, Phone, Wrench, DollarSign, Clock, CheckCircle, ChevronDown, Loader2 } from 'lucide-react'

const SERVICES_WINDOW = [
  { value: 'window-ext',        label: 'Windows — Exterior' },
  { value: 'window-int',        label: 'Windows — Interior' },
  { value: 'window-both',       label: 'Windows — Int + Ext' },
  { value: 'gutters',           label: 'Gutter Cleaning' },
  { value: 'pressure-washing',  label: 'Pressure Washing' },
  { value: 'roof',              label: 'Roof Cleaning' },
  { value: 'screens',           label: 'Screen Cleaning' },
  { value: 'solar',             label: 'Solar Panels' },
]

const SERVICES_LANDSCAPE = [
  { value: 'lawn-mowing',        label: 'Lawn Mowing' },
  { value: 'hedge-trimming',     label: 'Hedge Trimming' },
  { value: 'landscape-cleanup',  label: 'Cleanup' },
  { value: 'mulching',           label: 'Mulching' },
  { value: 'weeding',            label: 'Weeding' },
  { value: 'planting',           label: 'Planting' },
  { value: 'aeration',           label: 'Lawn Aeration' },
  { value: 'snow-removal',       label: 'Snow Removal' },
]

function Field({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 mb-2">
        {Icon && <Icon size={14} className="text-slate-500" />}
        {label}
      </label>
      {children}
    </div>
  )
}

const INPUT = "w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
const INPUT_CENTER = INPUT + " text-center"

const MAX_PER_DAY = 3

export default function Booking() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [form, setForm] = useState({
    business:  'window',
    firstName: '',
    lastName:  '',
    phone:     '',
    address:   '',
    services:  [],
    price:     '',
    date:      '',
    time:      '',
    notes:     '',
  })
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState('')
  const [dayCount, setDayCount]     = useState(null)   // bookings on selected date
  const [checking, setChecking]     = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }
  function setBusiness(val) { setForm(f => ({ ...f, business: val, services: [] })) }

  function toggleService(val) {
    setForm(f => ({
      ...f,
      services: f.services.includes(val)
        ? f.services.filter(s => s !== val)
        : [...f.services, val],
    }))
  }

  async function handleDateChange(dateStr) {
    set('date', dateStr)
    if (!dateStr) { setDayCount(null); return }
    setChecking(true)
    try {
      const { data } = await api.get('/deals/', { params: { limit: 1000, business_type: form.business } })
      const count = data.filter(d => {
        if (!d.expected_close_date) return false
        return d.expected_close_date.slice(0, 10) === dateStr
      }).length
      setDayCount(count)
    } catch {
      setDayCount(null)
    } finally {
      setChecking(false)
    }
  }

  const dayFull = dayCount !== null && dayCount >= MAX_PER_DAY
  const slotsLeft = dayCount !== null ? Math.max(0, MAX_PER_DAY - dayCount) : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim()) { setError('First name is required'); return }
    if (form.business === 'window' && !form.date) { setError('Date is required'); return }
    if (form.business === 'window' && dayFull)    { setError(`This day is fully booked (${MAX_PER_DAY}/${MAX_PER_DAY}). Choose another date.`); return }
    setSaving(true)
    try {
      // 1. Create or find contact
      const contactPayload = {
        first_name: form.firstName.trim(),
        last_name:  form.lastName.trim() || null,
        phone:      form.phone.trim() || null,
        address:    form.address.trim() || null,
        services:   form.services.join(',') || null,
        price:      form.price !== '' ? parseFloat(form.price) : null,
        status:     'prospect',
      }
      const { data: contact } = await api.post('/contacts/', contactPayload)

      // 2. Build appointment datetime ISO string
      const timeStr = form.time || '08:00'
      const apptIso = form.date ? `${form.date}T${timeStr}:00` : null

      // 3. Create deal linked to that contact
      const allServices = form.business === 'landscape' ? SERVICES_LANDSCAPE : SERVICES_WINDOW
      const serviceLabel = form.services.length > 0
        ? form.services.map(s => allServices.find(x => x.value === s)?.label || s).join(', ')
        : 'Appointment'
      const dealPayload = {
        title:               `${form.firstName} ${form.lastName}`.trim() + ` — ${serviceLabel}`,
        value:               form.price !== '' ? parseFloat(form.price) : 0,
        stage:               'qualified',
        contact_id:          contact.id,
        expected_close_date: apptIso,
        notes:               form.notes.trim() || null,
        assigned_to:         user?.id,
        job_status:          'todo',
        business_type:       form.business,
      }
      await api.post('/deals/', dealPayload)

      // 3. Trigger geocoding for address
      if (form.address.trim()) {
        api.post(`/contacts/${contact.id}/geocode`).catch(() => {})
      }

      setSuccess(true)
      setTimeout(() => navigate('/calendar'), 1800)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save booking')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center px-4 text-center" style={{ minHeight: '60vh' }}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${form.business === 'landscape' ? 'bg-emerald-500/20' : 'bg-emerald-500/20'}`}>
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">
          {form.business === 'landscape' ? 'Project Saved!' : 'Booking Saved!'}
        </h2>
        <p className="text-slate-400 text-sm">
          {form.business === 'landscape'
            ? 'Go to the Landscape calendar to add steps & assign crew.'
            : 'Redirecting to calendar…'}
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 md:px-8 md:pt-8 max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">New Booking</h1>
        <p className="text-slate-500 text-xs mt-0.5">Schedule an appointment for a client</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Business selector */}
        <div className="flex gap-2">
          {[{ v: 'window', label: 'Window Cleaning' }, { v: 'landscape', label: 'Landscape' }].map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setBusiness(v)}
              className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all ${
                form.business === v
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 active:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Customer Name */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <User size={12} /> Customer
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *">
              <input
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="Jean"
                className={INPUT}
                style={{ height: '48px' }}
                required
              />
            </Field>
            <Field label="Last Name">
              <input
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                placeholder="Tremblay"
                className={INPUT}
                style={{ height: '48px' }}
              />
            </Field>
          </div>
          <Field label="Phone Number" icon={Phone}>
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="450-555-1234"
              className={INPUT}
              style={{ height: '48px' }}
            />
          </Field>
          <Field label="Service Address" icon={MapPin}>
            <input
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="123 Rue des Érables, Saint-Jérôme"
              className={INPUT}
              style={{ height: '48px' }}
            />
          </Field>
        </div>

        {/* Date & Time */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4 overflow-hidden">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays size={12} /> Date & Time
          </h2>
          <div>
            <Field label="Date *">
              <input
                type="date"
                value={form.date}
                onChange={e => handleDateChange(e.target.value)}
                className={`${INPUT_CENTER} ${dayFull ? 'border-red-500/70 ring-1 ring-red-500/40' : ''}`}
                style={{ colorScheme: 'dark', height: '48px' }}
                required
              />
            </Field>
            {checking && (
              <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Checking…
              </p>
            )}
            {!checking && slotsLeft !== null && (
              <p className={`mt-1.5 text-xs font-semibold flex items-center gap-1 ${
                slotsLeft === 0 ? 'text-red-400' : slotsLeft === 1 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                  slotsLeft === 0 ? 'bg-red-400' : slotsLeft === 1 ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                {slotsLeft === 0
                  ? 'Fully booked'
                  : `${slotsLeft} slot${slotsLeft > 1 ? 's' : ''} left`}
              </p>
            )}
          </div>
          <Field label="Time" icon={Clock}>
            <input
              type="time"
              value={form.time}
              onChange={e => set('time', e.target.value)}
              className={INPUT_CENTER}
              style={{ colorScheme: 'dark', height: '48px' }}
            />
          </Field>
        </div>

        {/* Services */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Wrench size={12} /> Services
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {(form.business === 'landscape' ? SERVICES_LANDSCAPE : SERVICES_WINDOW).map(s => {
              const active = form.services.includes(s.value)
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    active
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 active:bg-slate-700'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Price & Notes */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign size={12} /> Pricing & Notes
          </h2>
          <Field label="Quoted Price ($)" icon={DollarSign}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={e => set('price', e.target.value)}
              placeholder="0.00"
              className={INPUT}
              style={{ height: '48px' }}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Special instructions, access codes, customer preferences…"
              rows={3}
              className={INPUT + ' py-3 resize-none'}
            />
          </Field>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || dayFull}
          className={`w-full font-bold rounded-2xl text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
            dayFull
              ? 'bg-red-900/40 border border-red-700/50 text-red-400 cursor-not-allowed'
              : 'bg-indigo-600 active:bg-indigo-700 text-white'
          }`}
          style={{ height: '56px' }}
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <CalendarDays size={20} />}
          {saving ? 'Saving…' : dayFull ? `Day fully booked (${MAX_PER_DAY}/${MAX_PER_DAY})` : 'Book Appointment'}
        </button>

      </form>
    </div>
  )
}
