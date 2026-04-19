import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { ChevronLeft, ChevronRight, Clock, User, Bell, Send, CheckCircle2, AlertCircle, Loader, Phone, Wrench } from 'lucide-react'

const API = '/api'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_DOT = {
  scheduled:   'bg-blue-400',
  confirmed:   'bg-green-400',
  completed:   'bg-slate-400',
  cancelled:   'bg-red-400',
  no_show:     'bg-yellow-400',
  in_progress: 'bg-indigo-400',
}

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate()+n); return c }

// ── Campaign panel ─────────────────────────────────────────────────────────────
function CampaignPanel({ token }) {
  const [running, setRunning] = useState(null)  // which type is running
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const headers = { Authorization: `Bearer ${token}` }

  // For 7-day: "today's clients" means appointments 7 days from today
  const in7days = toYMD(addDays(new Date(), 7))

  async function runCampaign(type, targetDate) {
    setRunning(type)
    setResult(null)
    setError(null)
    try {
      const url = targetDate
        ? `${API}/reminders/run?reminder_type=${type}&target_date=${targetDate}`
        : `${API}/reminders/run?reminder_type=${type}`
      const res = await fetch(url, { method: 'POST', headers })
      if (!res.ok) throw new Error(await res.text())
      setResult({ type, ...(await res.json()) })
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(null)
    }
  }

  const campaigns = [
    {
      type: '7day',
      label: '7-Day Reminder',
      desc: `Send to clients with appointments on ${in7days}`,
      targetDate: in7days,
      color: 'from-indigo-600 to-indigo-500',
      icon: '📅',
    },
    {
      type: '48h',
      label: '48h Reminder',
      desc: 'Send to clients with appointments in ~48 hours',
      targetDate: null,
      color: 'from-blue-600 to-blue-500',
      icon: '⏰',
    },
    {
      type: '24h',
      label: '24h Reminder',
      desc: 'Send to clients with appointments tomorrow',
      targetDate: null,
      color: 'from-violet-600 to-violet-500',
      icon: '🔔',
    },
  ]

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mt-5">
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-indigo-400" />
          <h2 className="text-white font-semibold">SMS Reminder Campaign</h2>
        </div>
        <p className="text-slate-500 text-xs mt-0.5">Sends to all eligible clients with a phone number. Skips already-sent.</p>
      </div>

      <div className="divide-y divide-slate-800">
        {campaigns.map(c => (
          <div key={c.type} className="px-4 py-3.5 flex items-center gap-4">
            <div className="text-2xl">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{c.label}</p>
              <p className="text-slate-500 text-xs">{c.desc}</p>
            </div>
            <button
              onClick={() => runCampaign(c.type, c.targetDate)}
              disabled={!!running}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r ${c.color} disabled:opacity-50 transition-opacity shrink-0`}
            >
              {running === c.type
                ? <Loader size={13} className="animate-spin" />
                : <Send size={13} />}
              {running === c.type ? 'Sending…' : 'Send'}
            </button>
          </div>
        ))}
      </div>

      {/* Result */}
      {result && (
        <div className="px-4 py-3 bg-green-900/20 border-t border-green-800/30">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <CheckCircle2 size={15} />
            <span className="text-sm font-medium">Campaign sent — {result.type}</span>
          </div>
          <p className="text-slate-400 text-xs">
            ✅ {result.sent} sent · ⏭ {result.skipped} skipped · ❌ {result.failed} failed
          </p>
          {result.details?.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.details.map(d => (
                <p key={d.id} className="text-xs text-slate-400 truncate">
                  → {d.phone_number} · {d.message_body?.slice(0, 60)}…
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-t border-red-800/30 flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  )
}

// ── Main Calendar ──────────────────────────────────────────────────────────────
export default function Calendar() {
  const { token } = useAuth()
  const [today] = useState(new Date())
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [bookings, setBookings] = useState([])
  const [selected, setSelected] = useState(null)

  const headers = { Authorization: `Bearer ${token}` }

  async function load(year, month) {
    const from = new Date(year, month, 1).toISOString()
    const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const res = await fetch(`${API}/bookings/?from_date=${from}&to_date=${to}&limit=500`, { headers })
    setBookings(await res.json())
  }

  useEffect(() => { load(current.getFullYear(), current.getMonth()) }, [current])

  function prevMonth() { setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1)) }
  function nextMonth() { setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1)) }

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function bookingsOnDay(d) {
    return bookings.filter(b => {
      const bd = new Date(b.scheduled_at)
      return bd.getFullYear() === year && bd.getMonth() === month && bd.getDate() === d
    })
  }

  const selectedBookings = selected ? bookingsOnDay(selected) : []

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronLeft size={18} /></button>
          <span className="text-white font-medium text-sm w-36 text-center">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Grid header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />
          const dayBookings = bookingsOnDay(day)
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
          const isSelected = day === selected
          return (
            <button
              key={day}
              onClick={() => setSelected(day === selected ? null : day)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1 transition-colors ${
                isSelected ? 'bg-indigo-600' : isToday ? 'bg-indigo-900/50 ring-1 ring-indigo-500' : 'hover:bg-slate-800'
              }`}
            >
              <span className={`text-xs font-medium ${isSelected ? 'text-white' : isToday ? 'text-indigo-300' : 'text-slate-300'}`}>{day}</span>
              {dayBookings.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5">
                  {dayBookings.slice(0, 3).map(b => (
                    <span key={b.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status] || 'bg-slate-400'}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day bookings */}
      {selected && (
        <div className="mt-5">
          <h2 className="text-white font-medium mb-3">
            {MONTHS[month]} {selected} — {selectedBookings.length} booking{selectedBookings.length !== 1 ? 's' : ''}
          </h2>
          {selectedBookings.length === 0 ? (
            <p className="text-slate-500 text-sm">No bookings on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedBookings.map(b => (
                <div key={b.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-white font-semibold text-sm">{b.title}</span>
                      {b.contact && (
                        <p className="text-slate-400 text-xs mt-0.5">
                          {b.contact.first_name} {b.contact.last_name || ''}
                        </p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 shrink-0">{b.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(b.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {b.duration_minutes}m
                    </span>
                    <span className="flex items-center gap-1">
                      <Wrench size={11} />
                      {b.type}
                    </span>
                    {b.contact?.phone && (
                      <a href={`tel:${b.contact.phone}`}
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                        onClick={e => e.stopPropagation()}>
                        <Phone size={11} />
                        {b.contact.phone}
                      </a>
                    )}
                    {b.technician && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {b.technician.full_name || b.technician.username}
                      </span>
                    )}
                  </div>
                  {b.notes && (
                    <p className="text-slate-500 text-xs mt-2 leading-relaxed">{b.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SMS Campaign panel */}
      <CampaignPanel token={token} />
    </div>
  )
}
