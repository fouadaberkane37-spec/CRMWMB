import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { CalendarDays, User, MapPin, Phone, Wrench, DollarSign, Clock, CheckCircle, ChevronDown, Loader2 } from 'lucide-react'

const SERVICES = [
  { value: 'window-ext',        label: 'Windows — Exterior' },
  { value: 'window-int',        label: 'Windows — Interior' },
  { value: 'window-both',       label: 'Windows — Int + Ext' },
  { value: 'gutters',           label: 'Gutter Cleaning' },
  { value: 'pressure-washing',  label: 'Pressure Washing' },
  { value: 'roof',              label: 'Roof Cleaning' },
  { value: 'screens',           label: 'Screen Cleaning' },
  { value: 'solar',             label: 'Solar Panels' },
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

export default function Booking() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [form, setForm] = useState({
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
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleService(val) {
    setForm(f => ({
      ...f,
      services: f.services.includes(val)
        ? f.services.filter(s => s !== val)
        : [...f.services, val],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim()) { setError('First name is required'); return }
    if (!form.date)              { setError('Date is required'); return }
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
      const apptIso = new Date(`${form.date}T${timeStr}:00`).toISOString()

      // 3. Create deal linked to that contact
      const serviceLabel = form.services.length > 0
        ? form.services.map(s => SERVICES.find(x => x.value === s)?.label || s).join(', ')
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
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Booking Saved!</h2>
        <p className="text-slate-400 text-sm">Redirecting to calendar…</p>
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
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays size={12} /> Date & Time
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                className={INPUT + ' [color-scheme:dark]'}
                style={{ height: '48px' }}
                required
              />
            </Field>
            <Field label="Time" icon={Clock}>
              <input
                type="time"
                value={form.time}
                onChange={e => set('time', e.target.value)}
                className={INPUT + ' [color-scheme:dark]'}
                style={{ height: '48px' }}
              />
            </Field>
          </div>
        </div>

        {/* Services */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Wrench size={12} /> Services
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {SERVICES.map(s => {
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
          disabled={saving}
          className="w-full bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-2xl text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ height: '56px' }}
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <CalendarDays size={20} />}
          {saving ? 'Saving…' : 'Book Appointment'}
        </button>

      </form>
    </div>
  )
}
