import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../App.jsx'
import { Plus, ChevronLeft, ChevronRight, X, Check, Clock, MapPin, DollarSign, Bell } from 'lucide-react'

const API = '/api'
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_STYLES = {
  scheduled:   'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  confirmed:   'bg-green-500/20 text-green-300 border border-green-500/30',
  in_progress: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  completed:   'bg-slate-600/30 text-slate-400 border border-slate-600/30',
  cancelled:   'bg-red-500/10 text-red-400 border border-red-500/20',
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function startOfWeek(d) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - copy.getDay())
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d, n) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function fmtWeekRange(monday) {
  const sun = addDays(monday, 6)
  const mStr = `${MONTH_SHORT[monday.getMonth()]} ${monday.getDate()}`
  const sStr = `${MONTH_SHORT[sun.getMonth()]} ${sun.getDate()}`
  return `${mStr} — ${sStr}`
}

function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Technician avatar ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-green-600','bg-blue-600','bg-purple-600','bg-orange-500','bg-teal-600','bg-rose-600',
]
function avatarColor(id) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }
function initials(name) {
  const parts = (name || '').split(' ')
  return parts.map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ── New Job form modal ────────────────────────────────────────────────────────
function JobForm({ onClose, onSave, contacts, defaultDate }) {
  const [form, setForm] = useState({
    title: '', contact_id: '', status: 'scheduled', priority: 'normal',
    scheduled_at: defaultDate ? `${defaultDate}T09:00` : '',
    value: '', address: '', notes: '',
  })

  async function handleSave() {
    if (!form.title.trim()) return
    await onSave({
      ...form,
      contact_id: form.contact_id || null,
      value: form.value ? parseFloat(form.value) : null,
      scheduled_at: form.scheduled_at || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-5 max-h-[92vh] overflow-y-auto">
        <h2 className="text-white font-semibold text-lg mb-4">New Job</h2>
        <div className="space-y-3">
          <input className="w-full bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
            placeholder="Job title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <select className="w-full bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
            value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
            <option value="">No contact</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          <input type="datetime-local"
            className="w-full bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
            value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
              value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['scheduled','confirmed','in_progress','completed','cancelled'].map(s =>
                <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <input type="number" placeholder="Value ($)"
              className="bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
              value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </div>
          <input className="w-full bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
            placeholder="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <textarea rows={2} className="w-full bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl text-sm font-medium">Cancel</button>
          <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Assign Technicians drawer ─────────────────────────────────────────────────
function AssignDrawer({ job, techs, shifts, onAssign, onUnassign, onClose }) {
  const assignedIds = new Set(job.technicians.map(jt => jt.technician_id))
  const shiftMap = {}
  shifts.forEach(s => { shiftMap[s.user_id] = s.status })

  function techLabel(techId) {
    const s = shiftMap[techId]
    if (s === 'confirmed') return { text: 'Confirmed for this day', color: 'text-green-400', dot: 'bg-green-500' }
    if (s === 'available') return { text: 'Available this day', color: 'text-blue-400', dot: 'bg-blue-500' }
    return { text: 'No availability set', color: 'text-slate-500', dot: 'bg-slate-600' }
  }

  const contactName = job.contact
    ? `${job.contact.first_name} ${job.contact.last_name || ''}`.trim()
    : job.title

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-t-2xl w-full flex flex-col"
        style={{ maxHeight: '82vh' }}>

        {/* Fixed header — never scrolls */}
        <div className="px-4 pt-5 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-bold text-lg">Assign Technicians</span>
            <button onClick={onClose}
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              Done
            </button>
          </div>
          <p className="text-slate-400 text-sm mb-3">
            {contactName} · {assignedIds.size} assigned
          </p>
          <div className="flex gap-5 mb-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Shift confirmed
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Available
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-slate-500" /> No availability set
            </span>
          </div>
        </div>

        {/* Scrollable tech list */}
        <div className="overflow-y-auto flex-1 px-4 space-y-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
          {techs.map(tech => {
            const assigned = assignedIds.has(tech.id)
            const { text, color, dot } = techLabel(tech.id)
            const name = tech.full_name || tech.username
            return (
              <button
                key={tech.id}
                onClick={() => assigned ? onUnassign(job.id, tech.id) : onAssign(job.id, tech.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors text-left ${
                  assigned
                    ? 'bg-green-900/30 border border-green-700/40'
                    : 'bg-slate-800/60 border border-slate-700/40'
                }`}
              >
                <div className={`w-11 h-11 rounded-full ${avatarColor(tech.id)} flex items-center justify-center text-white font-bold text-base shrink-0`}>
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{name}</p>
                  <p className={`text-xs ${color}`}>{text}</p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  assigned ? 'border-green-500 bg-green-500' : 'border-slate-600 bg-transparent'
                }`}>
                  {assigned && <Check size={13} className="text-white" strokeWidth={3} />}
                </div>
              </button>
            )
          })}
          {techs.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No technicians found</p>
          )}
        </div>
      </div>
    </div>
  )
}

const REMINDER_LABEL = { '7day': '7d', '48h': '48h', '24h': '24h' }

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({ job, techs, remindersSent, onOpenAssign, onStatusChange }) {
  const assignedIds = new Set(job.technicians.map(jt => jt.technician_id))
  const contactName = job.contact
    ? `${job.contact.first_name} ${job.contact.last_name || ''}`.trim()
    : job.title
  const sentTypes = remindersSent || []

  return (
    <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-base">{contactName}</p>
          {job.address && (
            <p className="text-slate-400 text-sm flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="shrink-0" /> {job.address}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-slate-400 text-sm">
            {job.scheduled_at && (
              <span className="flex items-center gap-1"><Clock size={12} />{fmtTime(job.scheduled_at)}</span>
            )}
            {job.value != null && (
              <span className="flex items-center gap-1"><DollarSign size={12} />{job.value}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <select
            value={job.status}
            onChange={e => { e.stopPropagation(); onStatusChange(job.id, e.target.value) }}
            onClick={e => e.stopPropagation()}
            className={`text-xs font-medium rounded-xl px-3 py-1.5 border-0 focus:outline-none ${STATUS_STYLES[job.status] || 'bg-slate-700 text-slate-300'}`}
            style={{ background: 'transparent' }}
          >
            {['scheduled','confirmed','in_progress','completed','cancelled'].map(s =>
              <option key={s} value={s} className="bg-slate-800 text-white">{s.replace('_',' ')}</option>)}
          </select>
          {/* Reminder badges */}
          {sentTypes.length > 0 && (
            <div className="flex gap-1">
              {['7day','48h','24h'].map(t => (
                <span key={t}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                    sentTypes.includes(t)
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-slate-700/50 text-slate-600 border border-slate-700'
                  }`}>
                  <Bell size={8} />{REMINDER_LABEL[t]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assigned techs row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {techs
            .filter(t => assignedIds.has(t.id))
            .map(t => {
              const name = t.full_name || t.username
              return (
                <span key={t.id}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${avatarColor(t.id)} bg-opacity-80 text-white font-medium`}>
                  {initials(name)} {name.split(' ')[0]} ✓
                </span>
              )
            })}
          {assignedIds.size === 0 && (
            <span className="text-slate-500 text-xs">No technicians assigned</span>
          )}
        </div>
        <button
          onClick={() => onOpenAssign(job)}
          className="text-xs text-indigo-400 font-medium px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors shrink-0 ml-2"
        >
          Assign
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobAssignment() {
  const { token } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => {
    const t = new Date(); t.setHours(0,0,0,0); return t
  })
  const [jobs, setJobs] = useState([])
  const [techs, setTechs] = useState([])
  const [shifts, setShifts] = useState([])
  const [reminderMap, setReminderMap] = useState({})  // jobId → [types sent]
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [contacts, setContacts] = useState([])
  const [assignTarget, setAssignTarget] = useState(null)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const dateStr = toDateStr(selectedDate)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${API}/jobs/by-date/${dateStr}`, { headers })
    setJobs(await res.json())
    setLoading(false)
  }, [dateStr])

  const loadShifts = useCallback(async () => {
    const res = await fetch(`${API}/jobs/shifts/${dateStr}`, { headers })
    setShifts(await res.json())
  }, [dateStr])

  const loadReminders = useCallback(async () => {
    const res = await fetch(`${API}/reminders/by-date/${dateStr}`, { headers })
    setReminderMap(await res.json())
  }, [dateStr])

  useEffect(() => {
    async function init() {
      const [cRes, uRes] = await Promise.all([
        fetch(`${API}/contacts/?limit=500`, { headers }),
        fetch(`${API}/users/`, { headers }),
      ])
      setContacts(await cRes.json())
      setTechs((await uRes.json()).filter(u => u.role === 'technician' || u.role === 'admin'))
    }
    init()
  }, [])

  useEffect(() => {
    loadJobs()
    loadShifts()
    loadReminders()
  }, [dateStr])

  // Re-sync selected week when selectedDate changes
  useEffect(() => {
    setWeekStart(startOfWeek(selectedDate))
  }, [selectedDate])

  async function handleCreate(data) {
    await fetch(`${API}/jobs/`, { method: 'POST', headers, body: JSON.stringify(data) })
    loadJobs()
  }

  async function handleStatusChange(jobId, status) {
    await fetch(`${API}/jobs/${jobId}/status?status=${status}`, { method: 'PATCH', headers })
    loadJobs()
  }

  async function handleAssign(jobId, techId) {
    const res = await fetch(`${API}/jobs/${jobId}/technicians/${techId}`, { method: 'POST', headers })
    const updated = await res.json()
    setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
    setAssignTarget(updated)
  }

  async function handleUnassign(jobId, techId) {
    const res = await fetch(`${API}/jobs/${jobId}/technicians/${techId}`, { method: 'DELETE', headers })
    const updated = await res.json()
    setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
    setAssignTarget(updated)
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Job count per day in week (only for loaded week's selected day; for other days show 0 without fetching)
  const dayJobCount = {}
  jobs.forEach(j => {
    if (j.scheduled_at) {
      const d = toDateStr(new Date(j.scheduled_at))
      dayJobCount[d] = (dayJobCount[d] || 0) + 1
    }
  })

  // All techs assigned to any job today (for the header badges)
  const todayAssignedIds = new Set()
  jobs.forEach(j => j.technicians.forEach(jt => todayAssignedIds.add(jt.technician_id)))

  const isToday = toDateStr(selectedDate) === toDateStr(today)
  const dayLabel = isToday
    ? 'Today'
    : selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* ── Week navigation ── */}
      <div className="px-4 pt-4 pb-2 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="text-slate-300 text-sm font-medium">{fmtWeekRange(weekStart)}</span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day selector row */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(d => {
            const ds = toDateStr(d)
            const isSelected = ds === dateStr
            const isDayToday = ds === toDateStr(today)
            const count = isSelected ? jobs.length : 0
            return (
              <button key={ds} onClick={() => setSelectedDate(d)}
                className={`flex flex-col items-center py-2 rounded-2xl transition-colors ${
                  isSelected ? 'bg-indigo-600' : 'hover:bg-slate-800'
                }`}>
                <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {DAY_LABELS[d.getDay()]}
                </span>
                <span className={`text-base font-bold ${
                  isSelected ? 'text-white' : isDayToday ? 'text-indigo-400' : 'text-slate-300'
                }`}>
                  {d.getDate()}
                </span>
                {isSelected && count > 0 && (
                  <span className="mt-1 text-[10px] text-indigo-200 font-medium">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Day header ── */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-base">
              {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
            {isToday && (
              <span className="bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Today</span>
            )}
            <span className="text-slate-400 text-sm">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          </div>
          {/* Active tech badges */}
          {todayAssignedIds.size > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {techs.filter(t => todayAssignedIds.has(t.id)).map(t => (
                <span key={t.id}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${avatarColor(t.id)} text-white font-medium`}>
                  {initials(t.full_name || t.username)} {(t.full_name || t.username).split(' ')[0]} ✓
                </span>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> New
        </button>
      </div>

      {/* ── Job list ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="text-slate-400 text-center py-12">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="text-lg mb-1">No jobs</p>
            <p className="text-sm">Tap + New to add one</p>
          </div>
        ) : (
          jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              techs={techs}
              remindersSent={reminderMap[job.id] || []}
              onOpenAssign={j => setAssignTarget(j)}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>

      {/* ── New Job form ── */}
      {showForm && (
        <JobForm
          onClose={() => setShowForm(false)}
          onSave={handleCreate}
          contacts={contacts}
          defaultDate={dateStr}
        />
      )}

      {/* ── Assign Technicians drawer ── */}
      {assignTarget && (
        <AssignDrawer
          job={assignTarget}
          techs={techs}
          shifts={shifts}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
