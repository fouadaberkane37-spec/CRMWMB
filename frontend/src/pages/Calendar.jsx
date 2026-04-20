import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../App.jsx'
import { ChevronLeft, ChevronRight, LayoutGrid, List, X, Calendar as CalIcon, Bell, Send, CheckCircle2, AlertCircle, Loader, Phone, Wrench, MapPin } from 'lucide-react'

const API = '/api'
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Status config ─────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'todo',            label: 'To Do',           dot: 'bg-indigo-400',  card: 'border-l-indigo-500',  chip: 'bg-indigo-600/80 text-white',    text: 'text-indigo-300' },
  { value: 'payment_pending', label: 'Payment Pending', dot: 'bg-amber-400',   card: 'border-l-amber-500',   chip: 'bg-amber-600/80 text-white',     text: 'text-amber-300' },
  { value: 'done',            label: 'Done',            dot: 'bg-green-400',   card: 'border-l-green-500',   chip: 'bg-green-700/80 text-white',     text: 'text-green-300' },
  { value: 'cancelled',       label: 'Cancelled',       dot: 'bg-slate-500',   card: 'border-l-slate-600',   chip: 'bg-slate-700 text-slate-300',    text: 'text-slate-400' },
]
// also handle legacy statuses from backend
const STATUS_MAP = {
  scheduled: 'todo', confirmed: 'todo', completed: 'done',
  no_show: 'cancelled', in_progress: 'todo',
}
function normalise(s) { return STATUS_MAP[s] || s }
function statusCfg(s) { return STATUSES.find(x => x.value === normalise(s)) || STATUSES[0] }

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

// ── Detail bottom sheet ───────────────────────────────────────────────────────
function DetailSheet({ booking, onClose, onUpdate }) {
  const { token } = useAuth()
  const [status, setStatus] = useState(normalise(booking.status))
  const [date, setDate] = useState(booking.scheduled_at ? toYMD(new Date(booking.scheduled_at)) : '')
  const [time, setTime] = useState(booking.scheduled_at ? fmtTime(booking.scheduled_at).replace(' AM','').replace(' PM','') : '')
  const [saving, setSaving] = useState(false)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const contactName = booking.contact
    ? `${booking.contact.first_name} ${booking.contact.last_name || ''}`.trim()
    : booking.title

  async function saveStatus(newStatus) {
    setStatus(newStatus)
    await fetch(`${API}/bookings/${booking.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...booking, status: newStatus, contact: undefined, technician: undefined }),
    })
    onUpdate()
  }

  async function saveTime() {
    if (!date || !time) return
    setSaving(true)
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString()
    await fetch(`${API}/bookings/${booking.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...booking, scheduled_at, status, contact: undefined, technician: undefined }),
    })
    setSaving(false)
    onUpdate()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-t-3xl w-full px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
        {/* Drag handle */}
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-white font-bold text-xl">{contactName}</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {fmtTime(booking.scheduled_at)}
              {booking.value != null && ` · $${booking.value}`}
            </p>
            {/* Info rows */}
            <div className="mt-3 space-y-2">
              {booking.type && (
                <div className="flex items-center gap-2">
                  <Wrench size={13} className="text-slate-500 shrink-0" />
                  <span className="text-slate-300 text-sm capitalize">{booking.type.replace('_', ' ')}</span>
                </div>
              )}
              {booking.contact?.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-slate-500 shrink-0" />
                  <a href={`tel:${booking.contact.phone}`}
                    className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">
                    {booking.contact.phone}
                  </a>
                </div>
              )}
              {booking.address && (
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-slate-500 shrink-0 mt-0.5" />
                  <span className="text-slate-300 text-sm">{booking.address}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Status */}
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Status</p>
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
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Reschedule</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <input type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-slate-800 text-white rounded-2xl px-4 py-4 text-sm text-center border border-slate-700 focus:outline-none focus:border-indigo-500" />
          <input type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="bg-slate-800 text-white rounded-2xl px-4 py-4 text-sm text-center border border-slate-700 focus:outline-none focus:border-indigo-500" />
        </div>
        <button
          onClick={saveTime}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-4 rounded-2xl text-base font-semibold transition-colors"
        >
          <CalIcon size={18} />
          {saving ? 'Saving…' : 'Save New Time'}
        </button>
      </div>
    </div>
  )
}

// ── Campaign panel ─────────────────────────────────────────────────────────────
function CampaignPanel({ token }) {
  const [running, setRunning] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
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
            <button onClick={() => runCampaign(c.type, c.targetDate)} disabled={!!running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0">
              {running === c.type ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
              {running === c.type ? 'Sending…' : 'Send'}
            </button>
          </div>
        ))}
      </div>
      {result && (
        <div className="px-4 py-3 bg-green-900/20 border-t border-green-800/30 text-xs text-slate-300">
          <span className="text-green-400 font-medium">✓ {result.type} sent</span> · {result.sent} sent · {result.skipped} skipped · {result.failed} failed
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
  const today = new Date()
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [viewMode, setViewMode] = useState('list')  // list | grid
  const [bookings, setBookings] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const headers = { Authorization: `Bearer ${token}` }

  async function load(year, month) {
    const from = new Date(year, month, 1).toISOString()
    const to   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const res = await fetch(`${API}/bookings/?from_date=${from}&to_date=${to}&limit=500`, { headers })
    setBookings(await res.json())
  }

  useEffect(() => { load(monthDate.getFullYear(), monthDate.getMonth()) }, [monthDate])

  function prevMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function nextMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }

  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()

  // Status counts (normalised)
  const counts = {}
  bookings.forEach(b => { const s = normalise(b.status); counts[s] = (counts[s] || 0) + 1 })

  const filtered = filterStatus
    ? bookings.filter(b => normalise(b.status) === filterStatus)
    : bookings

  const sorted = [...filtered].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  // Group by date string
  const grouped = {}
  sorted.forEach(b => {
    const d = b.scheduled_at ? toYMD(new Date(b.scheduled_at)) : 'no-date'
    grouped[d] = grouped[d] || []
    grouped[d].push(b)
  })
  const groupKeys = Object.keys(grouped).sort()

  // ── Grid view helpers ────────────────────────────────────────────────────────
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
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
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-white font-bold text-2xl">Calendar</h1>
            <p className="text-slate-400 text-sm">{bookings.length} appointment{bookings.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
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
            }`}>
            All {bookings.length}
          </button>
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                filterStatus === s.value ? s.chip : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}>
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label} {counts[s.value] || 0}
            </button>
          ))}
        </div>
      </div>

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groupKeys.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              <CalIcon size={40} className="mx-auto mb-3 opacity-30" />
              <p>No appointments this month</p>
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
                    const cfg = statusCfg(b.status)
                    const contactName = b.contact
                      ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim()
                      : b.title
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className={`w-full text-left bg-slate-900 border-l-4 ${cfg.card} rounded-r-2xl rounded-l-sm px-4 py-3.5 border border-slate-800 hover:border-slate-700 transition-colors`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-white font-semibold text-sm">{contactName}</span>
                          <span className={`text-xs font-medium shrink-0 ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-slate-400 text-xs flex-wrap">
                          <span>{fmtTime(b.scheduled_at)}</span>
                          {b.value != null && <span>· ${b.value}</span>}
                          {b.type && <span className="flex items-center gap-0.5"><Wrench size={10} />{b.type.replace('_',' ')}</span>}
                          {b.contact?.phone && (
                            <span className="text-indigo-400 flex items-center gap-0.5"><Phone size={10} />{b.contact.phone}</span>
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

      {/* ── Grid view ── */}
      {viewMode === 'grid' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="aspect-square" />
              const dayBookings = bookingsOnDay(day)
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              return (
                <div key={day}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-start pt-1.5 cursor-default ${
                    isToday ? 'bg-indigo-900/40 ring-1 ring-indigo-500' : ''
                  }`}>
                  <span className={`text-xs font-medium ${isToday ? 'text-indigo-300' : 'text-slate-400'}`}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5">
                    {dayBookings.slice(0, 4).map(b => (
                      <button key={b.id} onClick={() => setSelected(b)}
                        className={`w-1.5 h-1.5 rounded-full ${statusCfg(b.status).dot}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <CampaignPanel token={token} />
        </div>
      )}

      {/* ── Detail sheet ── */}
      {selected && (
        <DetailSheet
          booking={selected}
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
