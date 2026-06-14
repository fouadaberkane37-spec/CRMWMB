import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../App.jsx'
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, X,
  Calendar as CalIcon, Bell, Send, CheckCircle2, AlertCircle,
  Loader, Loader2, Phone, Wrench, MapPin, Users, Clock,
} from 'lucide-react'

const API = '/api'
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS         = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Status config ─────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'todo',            label: 'To Do',           dot: 'bg-indigo-400',  card: 'border-l-indigo-500',  chip: 'bg-indigo-600/80 text-white',  text: 'text-indigo-300' },
  { value: 'payment_pending', label: 'Payment Pending', dot: 'bg-amber-400',   card: 'border-l-amber-500',   chip: 'bg-amber-600/80 text-white',   text: 'text-amber-300'  },
  { value: 'done',            label: 'Done',            dot: 'bg-green-400',   card: 'border-l-green-500',   chip: 'bg-green-700/80 text-white',   text: 'text-green-300'  },
  { value: 'cancelled',       label: 'Cancelled',       dot: 'bg-slate-500',   card: 'border-l-slate-600',   chip: 'bg-slate-700 text-slate-300',  text: 'text-slate-400'  },
]
const STATUS_MAP = {
  scheduled: 'todo', confirmed: 'todo', completed: 'done',
  no_show: 'cancelled', in_progress: 'todo',
}
function normalise(s) { return STATUS_MAP[s] || s }
function statusCfg(s) { return STATUSES.find(x => x.value === normalise(s)) || STATUSES[0] }

// ── Service config (mirrors backend scheduling.py) ────────────────────────────
const SERVICE_LABELS = {
  'gutters':     'Nettoyage de gouttières',
  'window-ext':  'Vitres (Extérieur)',
  'window-int':  'Vitres (Intérieur)',
  'window-full': 'Vitres (Int. + Ext.)',
  'pressure':    'Lavage haute pression',
  'roof':        'Nettoyage de toiture',
  'screens':     'Nettoyage de moustiquaires',
  'solar':       'Panneaux solaires',
  'estimate':    'Estimation',
  'follow_up':   'Suivi',
  'service':     'Service général',
  'install':     'Installation',
}
const SERVICE_TECHS = {
  'gutters': 2, 'window-full': 2, 'roof': 2, 'solar': 2, 'install': 2,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function fmtDateLocal(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Available-slots fetcher ───────────────────────────────────────────────────
async function fetchAvailableSlots(token, date, type, duration, excludeId) {
  try {
    const params = new URLSearchParams({ date, type, duration })
    if (excludeId) params.set('exclude_id', excludeId)
    const res  = await fetch(`${API}/bookings/available-slots?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return await res.json()
  } catch {
    return { slots: [], blocked_reason: null }
  }
}

// ── Detail bottom sheet ───────────────────────────────────────────────────────
function DetailSheet({ booking, onClose, onUpdate, token }) {
  const [status,          setStatus]          = useState(normalise(booking.status))
  const [date,            setDate]            = useState(booking.scheduled_at ? toYMD(new Date(booking.scheduled_at)) : '')
  const [time,            setTime]            = useState(booking.scheduled_at ? booking.scheduled_at.slice(11, 16) : '')
  const [saving,          setSaving]          = useState(false)
  const [constraintError, setConstraintError] = useState(null)
  const [availableSlots,  setAvailableSlots]  = useState([])
  const [slotsLoading,    setSlotsLoading]    = useState(false)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const contactName = booking.contact
    ? `${booking.contact.first_name} ${booking.contact.last_name || ''}`.trim()
    : booking.title

  const svcLabel = SERVICE_LABELS[booking.type] || (booking.type || 'service').replace('_', ' ')
  const needs2   = (SERVICE_TECHS[booking.type] || 1) === 2

  // Load available slots when date changes
  useEffect(() => {
    if (!date || !booking.type) return
    setSlotsLoading(true)
    const dur = booking.duration_minutes || 60
    fetchAvailableSlots(token, date, booking.type, dur, booking.id).then(data => {
      setAvailableSlots(data.slots || [])
      setSlotsLoading(false)
    })
  }, [date])

  async function saveStatus(newStatus) {
    setStatus(newStatus)
    await fetch(`${API}/bookings/${booking.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ status: newStatus }),
    })
    onUpdate()
  }

  async function saveTime() {
    if (!date || !time) return
    setSaving(true)
    setConstraintError(null)
    const scheduled_at = `${date}T${time}:00`
    const res = await fetch(`${API}/bookings/${booking.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ scheduled_at, status }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setConstraintError(err.detail || 'Impossible de déplacer ce rendez-vous.')
      return
    }
    onUpdate()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-slate-900 rounded-t-3xl w-full px-5 pt-3 pb-8 max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-white font-bold text-xl">{contactName}</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {fmtTime(booking.scheduled_at)}
              {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Service */}
        <div className="mb-5">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Service</p>
          <div className="flex items-center gap-3 bg-slate-800 rounded-2xl px-4 py-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center shrink-0">
              <Wrench size={18} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-base">{svcLabel}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs flex items-center gap-1 ${needs2 ? 'text-amber-400' : 'text-slate-400'}`}>
                  <Users size={11} />
                  {needs2 ? '2 techniciens' : '1 technicien'}
                </span>
                {booking.duration_minutes && (
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    <Clock size={11} />{booking.duration_minutes} min
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="mb-5">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Contact</p>
          <div className="bg-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-700">
            {booking.contact?.phone ? (
              <a
                href={`tel:${booking.contact.phone}`}
                className="flex items-center gap-3 px-4 py-4 hover:bg-slate-700 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center shrink-0">
                  <Phone size={18} className="text-green-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Téléphone</p>
                  <p className="text-white font-semibold text-base">{booking.contact.phone}</p>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                  <Phone size={18} className="text-slate-500" />
                </div>
                <p className="text-slate-500 text-sm">Aucun numéro de téléphone</p>
              </div>
            )}
            {booking.address && (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Adresse</p>
                  <p className="text-white text-sm">{booking.address}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="mb-5">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Notes technicien</p>
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-4 py-4">
              <p className="text-amber-200 text-sm whitespace-pre-wrap leading-relaxed">{booking.notes}</p>
            </div>
          </div>
        )}

        {/* Status */}
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Statut</p>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => saveStatus(s.value)}
              className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                status === s.value
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Reschedule */}
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Replanifier</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setConstraintError(null) }}
            className="bg-slate-800 text-white rounded-2xl px-4 py-4 text-sm text-center border border-slate-700 focus:outline-none focus:border-indigo-500"
            style={{ colorScheme: 'dark' }}
          />
          <input
            type="time"
            value={time}
            onChange={e => { setTime(e.target.value); setConstraintError(null) }}
            className="bg-slate-800 text-white rounded-2xl px-4 py-4 text-sm text-center border border-slate-700 focus:outline-none focus:border-indigo-500"
            style={{ colorScheme: 'dark' }}
          />
        </div>

        {/* Available slots for this date */}
        {date && (
          <div className="mb-4">
            {slotsLoading ? (
              <p className="text-slate-500 text-xs flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Chargement des créneaux…
              </p>
            ) : availableSlots.length > 0 ? (
              <div>
                <p className="text-slate-500 text-xs mb-2">Créneaux disponibles :</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => { setTime(slot); setConstraintError(null) }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        time === slot
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertCircle size={13} />
                Aucun créneau libre ce jour — vérifiez la date.
              </div>
            )}
          </div>
        )}

        {/* Constraint error */}
        {constraintError && (
          <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-2xl px-4 py-3 mb-4">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{constraintError}</p>
          </div>
        )}

        <button
          onClick={saveTime}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-4 rounded-2xl text-base font-semibold transition-colors"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <CalIcon size={18} />}
          {saving ? 'Sauvegarde…' : 'Enregistrer la nouvelle heure'}
        </button>
      </div>
    </div>
  )
}

// ── Campaign panel ─────────────────────────────────────────────────────────────
function CampaignPanel({ token }) {
  const [running, setRunning] = useState(null)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)
  const headers = { Authorization: `Bearer ${token}` }
  const in7days = toYMD(new Date(Date.now() + 7 * 86400000))

  async function runCampaign(type, targetDate) {
    setRunning(type); setResult(null); setError(null)
    try {
      const url = targetDate
        ? `${API}/reminders/run?reminder_type=${type}&target_date=${targetDate}`
        : `${API}/reminders/run?reminder_type=${type}`
      const res = await fetch(url, { method: 'POST', headers })
      if (!res.ok) throw new Error(await res.text())
      setResult({ type, ...(await res.json()) })
    } catch (e) { setError(e.message) }
    finally { setRunning(null) }
  }

  const campaigns = [
    { type: '7day', label: '7-Day Reminder', desc: `Appointments on ${in7days}`, targetDate: in7days, icon: '📅' },
    { type: '48h',  label: '48h Reminder',   desc: 'Appointments in ~48 hours',  targetDate: null,    icon: '⏰' },
    { type: '24h',  label: '24h Reminder',   desc: 'Appointments ~tomorrow',     targetDate: null,    icon: '🔔' },
  ]

  return (
    <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-800 flex items-center gap-2">
        <Bell size={15} className="text-indigo-400" />
        <span className="text-white font-semibold text-sm">SMS Campaign</span>
        <span className="text-slate-500 text-xs ml-1">— skips already sent</span>
      </div>
      <div className="divide-y divide-slate-800">
        {campaigns.map(c => (
          <div key={c.type} className="px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{c.label}</p>
              <p className="text-slate-500 text-xs">{c.desc}</p>
            </div>
            <button
              onClick={() => runCampaign(c.type, c.targetDate)}
              disabled={!!running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0"
            >
              {running === c.type ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
              {running === c.type ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        ))}
      </div>
      {result && (
        <div className="px-4 py-3 bg-green-900/20 border-t border-green-800/30 text-xs text-slate-300">
          <span className="text-green-400 font-medium">✓ {result.type} envoyé</span>
          {' '}· {result.sent} envoyés · {result.skipped} ignorés · {result.failed} échoués
        </div>
      )}
      {error && (
        <div className="px-4 py-2 bg-red-900/20 border-t border-red-800/30 text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Calendar() {
  const { token } = useAuth()
  const today     = new Date()
  const [monthDate,    setMonthDate]    = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [viewMode,     setViewMode]     = useState('list')
  const [bookings,     setBookings]     = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [selected,     setSelected]     = useState(null)
  const headers = { Authorization: `Bearer ${token}` }

  async function load(year, month) {
    const from = new Date(year, month, 1).toISOString()
    const to   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const res  = await fetch(`${API}/bookings/?from_date=${from}&to_date=${to}&limit=500`, { headers })
    setBookings(await res.json())
  }

  useEffect(() => { load(monthDate.getFullYear(), monthDate.getMonth()) }, [monthDate])

  function prevMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function nextMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }

  const year  = monthDate.getFullYear()
  const month = monthDate.getMonth()

  const counts = {}
  let totalValue = 0
  bookings.forEach(b => {
    const s = normalise(b.status)
    counts[s] = (counts[s] || 0) + 1
    if (b.value) totalValue += b.value
  })

  const filtered = filterStatus
    ? bookings.filter(b => normalise(b.status) === filterStatus)
    : bookings

  const sorted = [...filtered].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  const grouped = {}
  sorted.forEach(b => {
    const d = b.scheduled_at ? toYMD(new Date(b.scheduled_at)) : 'no-date'
    grouped[d] = grouped[d] || []
    grouped[d].push(b)
  })
  const groupKeys = Object.keys(grouped).sort()

  // Grid helpers
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells       = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function bookingsOnDay(d) {
    return bookings.filter(b => {
      if (!b.scheduled_at) return false
      const bd = new Date(b.scheduled_at)
      return bd.getFullYear() === year && bd.getMonth() === month && bd.getDate() === d
    })
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-white font-bold text-2xl">Calendrier</h1>
            <p className="text-slate-400 text-sm">{bookings.length} rendez-vous</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {viewMode === 'list' ? <LayoutGrid size={20} /> : <List size={20} />}
            </button>
            <button onClick={prevMonth} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <span className="text-white font-semibold text-sm w-24 text-center">
              {MONTHS_SHORT[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Status chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilterStatus('')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
              filterStatus === '' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            Tous {bookings.length}
          </button>
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                filterStatus === s.value ? s.chip : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label} {counts[s.value] || 0}
            </button>
          ))}
          {totalValue > 0 && (
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-900/60 text-emerald-300 border border-emerald-700/40 shrink-0">
              $ {totalValue.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* List view */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groupKeys.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              <CalIcon size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucun rendez-vous ce mois-ci</p>
            </div>
          ) : groupKeys.map(dateKey => {
            const dayBookings = grouped[dateKey]
            const d = dateKey !== 'no-date' ? new Date(dateKey + 'T12:00:00') : null
            return (
              <div key={dateKey}>
                {d && (
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    {DAYS[d.getDay()]} {d.getDate()} {MONTHS_SHORT[d.getMonth()]}
                  </p>
                )}
                <div className="space-y-2">
                  {dayBookings.map(b => {
                    const cfg         = statusCfg(b.status)
                    const contactName = b.contact
                      ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim()
                      : b.title
                    const svcLabel = SERVICE_LABELS[b.type] || (b.type || 'service').replace('_', ' ')
                    const needs2   = (SERVICE_TECHS[b.type] || 1) === 2
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className={`w-full text-left bg-slate-900 border-l-4 ${cfg.card} rounded-r-2xl rounded-l-sm px-4 py-3.5 border border-slate-800 hover:border-slate-700 transition-colors`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-white font-semibold text-sm">{contactName}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {needs2 && (
                              <span className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded-md font-semibold flex items-center gap-0.5">
                                <Users size={9} />2T
                              </span>
                            )}
                            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-slate-400 text-xs flex-wrap">
                          <span>{fmtTime(b.scheduled_at)}</span>
                          {b.duration_minutes && <span>· {b.duration_minutes}min</span>}
                          {b.value != null && <span>· ${b.value}</span>}
                          <span className="flex items-center gap-0.5">
                            <Wrench size={10} />{svcLabel}
                          </span>
                          {b.contact?.phone && (
                            <span className="text-indigo-400 flex items-center gap-0.5">
                              <Phone size={10} />{b.contact.phone}
                            </span>
                          )}
                        </div>
                        {b.address && (
                          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                            <MapPin size={10} className="shrink-0" />{b.address}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <CampaignPanel token={token} />
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="grid grid-cols-7 border-b border-slate-800">
            {['D','L','M','M','J','V','S'].map((d, i) => (
              <div key={i} className="text-center text-xs font-medium text-slate-500 py-1.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-slate-800/60">
            {cells.map((day, i) => {
              if (!day) return (
                <div key={`e-${i}`} className="min-h-[4.5rem] border-b border-slate-800/60 bg-slate-950/40" />
              )
              const dayBookings = bookingsOnDay(day)
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              return (
                <div key={day}
                  className={`min-h-[4.5rem] border-b border-slate-800/60 p-0.5 overflow-hidden ${isToday ? 'bg-indigo-950/40' : ''}`}
                >
                  <div className={`text-xs font-semibold text-center py-0.5 mb-0.5 rounded-md ${
                    isToday ? 'text-white bg-indigo-600' : 'text-slate-400'
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayBookings.slice(0, 3).map(b => {
                      const cfg       = statusCfg(b.status)
                      const firstName = b.contact?.first_name || b.title || ''
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelected(b)}
                          className={`w-full text-left rounded px-1 py-0.5 flex items-center gap-0.5 overflow-hidden ${
                            cfg.value === 'done'            ? 'bg-green-700/70' :
                            cfg.value === 'payment_pending' ? 'bg-amber-700/70' :
                            cfg.value === 'cancelled'       ? 'bg-slate-700/60' :
                                                              'bg-indigo-700/70'
                          }`}
                        >
                          <span className="text-white/80 text-[9px] font-bold shrink-0 leading-none">
                            {fmtTime(b.scheduled_at)}
                          </span>
                          <span className="text-white text-[9px] truncate leading-none ml-0.5">
                            {firstName}
                          </span>
                        </button>
                      )
                    })}
                    {dayBookings.length > 3 && (
                      <p className="text-slate-500 text-[9px] text-center leading-none">
                        +{dayBookings.length - 3}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-4 pt-2">
            <CampaignPanel token={token} />
          </div>
        </div>
      )}

      {/* Detail sheet */}
      {selected && (
        <DetailSheet
          booking={selected}
          token={token}
          onClose={() => setSelected(null)}
          onUpdate={() => {
            load(year, month)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
