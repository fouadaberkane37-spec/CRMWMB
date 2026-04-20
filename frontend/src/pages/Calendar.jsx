import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { ChevronLeft, ChevronRight, DollarSign, CalendarDays, Clock, X, Lock,
         Phone, Mail, MapPin, Navigation, Timer, CheckCircle, MessageSquare,
         ClipboardList, AlertCircle, ChevronDown, ExternalLink, LogIn, LogOut,
         List, LayoutGrid, Trash2, Pencil, Loader2, Users, UserCheck, Wrench,
         Plus, Leaf, Check } from 'lucide-react'

// ── Job status config ──────────────────────────────────────────────────────────
const JOB_STATUSES = [
  { key: 'todo',            label: 'To Do',           color: 'bg-indigo-500',  text: 'text-white',     dot: 'bg-indigo-400',  badge: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50' },
  { key: 'payment_pending', label: 'Payment Pending', color: 'bg-amber-500',   text: 'text-white',     dot: 'bg-amber-400',   badge: 'bg-amber-900/50 text-amber-300 border-amber-700/50'   },
  { key: 'done',            label: 'Done',            color: 'bg-emerald-500', text: 'text-white',     dot: 'bg-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  { key: 'cancelled',       label: 'Cancelled',       color: 'bg-slate-600',   text: 'text-slate-300', dot: 'bg-slate-500',   badge: 'bg-slate-800 text-slate-400 border-slate-700/50'      },
]

const STATUS_MAP = Object.fromEntries(JOB_STATUSES.map(s => [s.key, s]))

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmt(date) { return date.toLocaleDateString('en-CA') }

function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate() }
function getFirstDayOfWeek(year, month) { return new Date(year, month, 1).getDay() }

// ── Status dropdown ────────────────────────────────────────────────────────────
function StatusMenu({ deal, onUpdate, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-700/60">
        <p className="text-xs font-semibold text-slate-400 truncate">{deal.title}</p>
        <p className="text-xs text-slate-500">${deal.value.toFixed(0)}</p>
      </div>
      {JOB_STATUSES.map(s => (
        <button key={s.key}
          onClick={() => { onUpdate(deal.id, s.key); onClose() }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-slate-800 ${deal.job_status === s.key ? 'text-white' : 'text-slate-400'}`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
          {s.label}
          {deal.job_status === s.key && <span className="ml-auto text-indigo-400 text-xs">✓</span>}
        </button>
      ))}
    </div>
  )
}

// ── Reschedule popup ───────────────────────────────────────────────────────────
function ReschedulePopup({ deal, onSave, onClose }) {
  const ref = useRef(null)
  const [date, setDate] = useState((deal.expected_close_date || '').slice(0, 10))
  const [time, setTime] = useState((deal.expected_close_date || '').slice(11, 16) || '09:00')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  async function handleSave() {
    if (!date) return
    setSaving(true)
    try {
      const iso = `${date}T${time || '09:00'}:00`
      await api.put(`/deals/${deal.id}`, { ...deal, expected_close_date: iso, contact_id: deal.contact_id })
      onSave(deal.id, iso)
      onClose()
    } finally { setSaving(false) }
  }

  const clientName = deal.contact ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim() : deal.title

  return (
    <div ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-200 truncate">{clientName}</p>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><CalendarDays size={12} /> Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><Clock size={12} /> Time</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-400 py-2 rounded-lg text-xs hover:bg-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !date}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Staffing helpers ──────────────────────────────────────────────────────────
function requiredTechs(deal) {
  const raw  = (deal.contact?.services || deal.title || '').toLowerCase()
  const tags = raw.split(/[,\s—–-]+/).map(s => s.trim()).filter(Boolean)
  const needs2     = tags.some(t => t.includes('gutter') || t.includes('int') || t.includes('interior'))
  const hasExt     = tags.some(t => t.includes('ext') || t.includes('exterior') || t.includes('window'))
  const hasPressure= tags.some(t => t.includes('pressure') || t.includes('wash'))
  const multi      = (hasExt ? 1 : 0) + (hasPressure ? 1 : 0) + (needs2 ? 1 : 0) >= 2
  return (needs2 || multi) ? 2 : 1
}

// ── Service label map ──────────────────────────────────────────────────────────
const SERVICE_LABELS = {
  'window-ext':  'Windows (Exterior)',
  'window-int':  'Windows (Interior)',
  'gutters':     'Gutter Cleaning',
  'pressure':    'Pressure Washing',
  'roof':        'Roof Cleaning',
  'screens':     'Screen Cleaning',
  'solar':       'Solar Panels',
}

// ── Technician Job Details Modal ───────────────────────────────────────────────
function TechJobModal({ deal, allDeals, onClose, onClockAction }) {
  const [jobNote, setJobNote]       = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved]   = useState(false)
  const [clocking, setClocking]     = useState(false)
  const [todayClocks, setTodayClocks] = useState([])

  const idx   = allDeals.findIndex(d => d.id === deal.id)
  const prev  = allDeals[idx - 1] || null
  const next  = allDeals[idx + 1] || null

  const contact  = deal.contact || {}
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || deal.title
  const address  = contact.address || ''
  const mapsUrl  = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null

  const apptDate = deal.expected_close_date ? new Date(deal.expected_close_date) : null
  const apptDateStr = apptDate
    ? apptDate.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const apptTimeStr = apptDate
    ? apptDate.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—'

  const services = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)

  const s = STATUS_MAP[deal.job_status] || STATUS_MAP.todo
  const statusColor = {
    todo: 'text-indigo-400 bg-indigo-900/30 border-indigo-700/40',
    payment_pending: 'text-amber-400 bg-amber-900/30 border-amber-700/40',
    done: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
    cancelled: 'text-slate-400 bg-slate-800 border-slate-700/40',
  }[deal.job_status] || 'text-indigo-400 bg-indigo-900/30 border-indigo-700/40'

  // Load today's clock entries for this deal
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    api.get('/timeclock/', { params: { deal_id: deal.id, date: today } })
      .then(r => setTodayClocks(r.data))
      .catch(() => {})
  }, [deal.id])

  const lastClock = todayClocks[todayClocks.length - 1]
  const clockedIn = lastClock?.clock_type === 'in'

  async function handleClock() {
    setClocking(true)
    try {
      const type = clockedIn ? 'out' : 'in'
      const res = await api.post('/timeclock/', { clock_type: type, deal_id: deal.id })
      setTodayClocks(prev => [...prev, res.data])
      if (onClockAction) onClockAction()
    } finally {
      setClocking(false)
    }
  }

  async function saveNote() {
    if (!jobNote.trim()) return
    setSavingNote(true)
    try {
      await api.post('/activities/', {
        type: 'note',
        title: `Tech note — ${fullName}`,
        description: jobNote.trim(),
        deal_id: deal.id,
        contact_id: contact.id || null,
      })
      setJobNote('')
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2500)
    } finally {
      setSavingNote(false)
    }
  }

  // Calculate hours clocked today
  const pairs = []
  let pendingIn = null
  for (const e of todayClocks) {
    if (e.clock_type === 'in') pendingIn = e
    else if (e.clock_type === 'out' && pendingIn) {
      pairs.push({ in: pendingIn, out: e })
      pendingIn = null
    }
  }
  const totalMs = pairs.reduce((acc, p) => acc + (new Date(p.out.clocked_at) - new Date(p.in.clocked_at)), 0)
  const totalHrs = Math.floor(totalMs / 3600000)
  const totalMins = Math.floor((totalMs % 3600000) / 60000)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-700/50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${statusColor}`}>{s.label}</span>
              <span className="text-slate-600 text-xs">#{deal.id}</span>
            </div>
            <h2 className="text-lg font-bold text-white truncate">{fullName}</h2>
            <p className="text-slate-400 text-sm">{deal.title}</p>
          </div>
          <button onClick={onClose} className="ml-3 text-slate-500 hover:text-white transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Appointment Date & Time */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <CalendarDays size={12} /> Appointment
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Date</p>
                <p className="text-sm text-white font-medium">{apptDateStr}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Time</p>
                <p className="text-sm text-white font-medium">{apptTimeStr}</p>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ClipboardList size={12} /> Customer
            </h3>
            <div className="space-y-2">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors group">
                  <Phone size={14} className="text-slate-500 group-hover:text-indigo-400 flex-shrink-0" />
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors group">
                  <Mail size={14} className="text-slate-500 group-hover:text-indigo-400 flex-shrink-0" />
                  {contact.email}
                </a>
              )}
              {address && (
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-300">{address}</span>
                </div>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium mt-1 transition-colors">
                  <Navigation size={12} /> Get Directions
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          {/* Services */}
          {services.length > 0 && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Services Requested</h3>
              <div className="flex flex-wrap gap-1.5">
                {services.map(svc => (
                  <span key={svc} className="text-xs px-2 py-1 bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 rounded-full">
                    {SERVICE_LABELS[svc] || svc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assigned Technicians */}
          {(deal.assigned_techs?.length > 0) && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Users size={12} /> Assigned Technicians
              </h3>
              <div className="flex flex-wrap gap-2">
                {deal.assigned_techs.map(tech => (
                  <div key={tech.id} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-900/30 border border-indigo-700/40 rounded-full">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                      {(tech.full_name || tech.username || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-indigo-200">{tech.full_name || tech.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes / Special Instructions */}
          {deal.notes && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertCircle size={12} /> Special Instructions
              </h3>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{deal.notes}</p>
            </div>
          )}

          {/* Clock In / Out */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Timer size={12} /> Job Timer
            </h3>
            {totalMs > 0 && (
              <p className="text-xs text-slate-400 mb-3">
                Time logged today: <span className="text-white font-semibold">{totalHrs}h {totalMins}m</span>
              </p>
            )}
            <button
              onClick={handleClock}
              disabled={clocking}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                clockedIn
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {clockedIn ? <LogOut size={16} /> : <LogIn size={16} />}
              {clocking ? 'Saving…' : clockedIn ? 'Clock Out' : 'Clock In'}
            </button>
            {todayClocks.length > 0 && (
              <div className="mt-3 space-y-1">
                {todayClocks.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={e.clock_type === 'in' ? 'text-emerald-500' : 'text-amber-500'}>
                      {e.clock_type === 'in' ? '▶' : '■'}
                    </span>
                    {e.clock_type === 'in' ? 'Clocked in' : 'Clocked out'} at{' '}
                    {new Date(e.clocked_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Job Note */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MessageSquare size={12} /> Add Job Note
            </h3>
            <textarea
              value={jobNote}
              onChange={e => setJobNote(e.target.value)}
              placeholder="Document work performed, issues found, recommendations…"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600"
            />
            <button
              onClick={saveNote}
              disabled={savingNote || !jobNote.trim()}
              className="mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {noteSaved ? '✓ Saved!' : savingNote ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/50">
          <button
            onClick={() => { /* handled by parent */ }}
            disabled={!prev}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span className="text-xs text-slate-600">{idx + 1} of {allDeals.length}</span>
          <button
            onClick={() => { /* handled by parent */ }}
            disabled={!next}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Deal chip — draggable ──────────────────────────────────────────────────────
function DealChip({ deal, allDeals, onUpdate, onReschedule, onDragStart, onDragEnd, isDragging, isAdmin, isTech }) {
  const [open, setOpen]           = useState(false)
  const [reschedule, setReschedule] = useState(false)
  const [techModal, setTechModal] = useState(false)
  const s = STATUS_MAP[deal.job_status] || STATUS_MAP.todo
  const chipAssigned    = deal.assigned_techs?.length || 0
  const chipUnderstaffed = isAdmin && chipAssigned < requiredTechs(deal)
  const chipBg   = chipUnderstaffed ? 'bg-amber-400'  : s.color
  const chipText = chipUnderstaffed ? 'text-amber-900' : s.text

  const time = deal.expected_close_date
    ? new Date(deal.expected_close_date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  const clientName = deal.contact
    ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
    : deal.title

  function handleDragStart(e) {
    if (!isAdmin) { e.preventDefault(); return }
    e.dataTransfer.setData('dealId', String(deal.id))
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => onDragStart(deal.id), 0)
  }

  return (
    <>
      <div
        draggable={isAdmin}
        onDragStart={handleDragStart}
        onDragEnd={isAdmin ? onDragEnd : undefined}
        className={`relative group transition-opacity select-none ${isDragging ? 'opacity-30 scale-95' : ''}`}
        style={{ cursor: isAdmin ? 'grab' : isTech ? 'pointer' : 'default' }}
      >
        {/* Main chip */}
        <button
          onClick={e => {
            e.stopPropagation()
            if (isDragging) return
            if (isTech) { setTechModal(true); return }
            if (!isAdmin) return
            setReschedule(false)
            setOpen(v => !v)
          }}
          className={`w-full text-left px-1.5 py-1 rounded-md text-xs font-medium leading-tight ${chipBg} ${chipText} ${!isAdmin && !isTech ? 'cursor-default' : ''}`}
          title={isAdmin ? `${clientName}${chipUnderstaffed ? ' — ⚠ Understaffed' : ''}` : clientName}
        >
          {time && <span className="opacity-75 mr-1">{time}</span>}
          <span className="truncate">{clientName}</span>
          {chipUnderstaffed && <span className="ml-1 opacity-80">⚠</span>}
          {isTech && <ExternalLink size={8} className="inline ml-1 opacity-60" />}
          {!isAdmin && !isTech && <Lock size={8} className="inline ml-1 opacity-40" />}
        </button>

        {/* Reschedule icon — admin only */}
        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); setReschedule(v => !v) }}
            className="absolute right-0.5 top-0.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded bg-black/30 hover:bg-black/50 text-white/80"
            title="Reschedule"
          >
            <CalendarDays size={9} />
          </button>
        )}

        {open && isAdmin && <StatusMenu deal={deal} onUpdate={onUpdate} onClose={() => setOpen(false)} />}
        {reschedule && isAdmin && <ReschedulePopup deal={deal} onSave={onReschedule} onClose={() => setReschedule(false)} />}
      </div>

      {techModal && (
        <TechJobModal
          deal={deal}
          allDeals={allDeals}
          onClose={() => setTechModal(false)}
        />
      )}
    </>
  )
}

// ── Day cell — drop target ─────────────────────────────────────────────────────
function DayCell({ dayNum, dateStr, isValid, isToday, isPast, deals, allDeals, isDragOver, onDragOver, onDragLeave, onDrop, onUpdate, onReschedule, onDragStart, onDragEnd, draggingDealId, isAdmin, isTech, landscapePhases = [], isLandscape = false }) {
  return (
    <div
      className={`border-b border-r p-1.5 flex flex-col gap-1 transition-colors ${
        !isValid   ? (isLandscape ? 'bg-[#050f0a] border-emerald-950' : 'bg-slate-900/30 border-slate-700/30') :
        isDragOver ? (isLandscape ? 'bg-emerald-900/40 border-emerald-700/60' : 'bg-indigo-900/25 border-indigo-500/60') :
        isPast     ? (isLandscape ? 'bg-[#060d09] border-emerald-950' : 'bg-slate-900/60 border-slate-700/30') :
                     (isLandscape ? 'bg-[#0a1f14] border-emerald-900/40' : 'bg-slate-900 border-slate-700/30')
      }`}
      onDragOver={isValid && isAdmin ? onDragOver : undefined}
      onDragLeave={isValid && isAdmin ? onDragLeave : undefined}
      onDrop={isValid && isAdmin ? onDrop : undefined}
    >
      {/* Drop zone highlight ring */}
      {isDragOver && isValid && (
        <div className="absolute inset-0 rounded pointer-events-none ring-2 ring-indigo-400/50 ring-inset" />
      )}

      {isValid && (
        <span className={`text-xs font-semibold self-start w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
          isToday ? (isLandscape ? 'bg-emerald-400 text-emerald-950 font-bold' : 'bg-indigo-600 text-white') : isPast ? (isLandscape ? 'text-emerald-800' : 'text-slate-600') : (isLandscape ? 'text-emerald-300' : 'text-slate-400')
        }`}>
          {dayNum}
        </span>
      )}

      {/* Drop hint when dragging over an empty day */}
      {isDragOver && deals.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-indigo-400/60 text-xs font-medium">Drop here</span>
        </div>
      )}

      {deals.map(deal => (
        <DealChip
          key={deal.id}
          isAdmin={isAdmin}
          isTech={isTech}
          deal={deal}
          allDeals={allDeals}
          onUpdate={onUpdate}
          onReschedule={onReschedule}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isDragging={draggingDealId === deal.id}
        />
      ))}

      {landscapePhases.map(p => {
        const time = p.phase_date
          ? new Date(p.phase_date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
          : ''
        return (
          <div key={p.id} className={`px-1.5 py-1 rounded-md text-xs font-medium leading-tight truncate flex items-center gap-1 ${
            p.status === 'done' ? 'bg-emerald-950 text-emerald-500 line-through' : 'bg-emerald-600 text-white'
          }`}>
            <Leaf size={8} className="shrink-0 opacity-70" />
            {time && <span className="opacity-60 shrink-0">{time}</span>}
            <span className="truncate">{p.title}</span>
          </div>
        )
      })}
    </div>
  )
}

const LANDSCAPE_SERVICE_LABELS = {
  'pavers-pressure': 'Pavers Pressure Washing',
  'pavers-relevel':  'Pavers Relevel',
  'pavers-install':  'Pavers Install',
}

// ── Landscape Project Sheet ────────────────────────────────────────────────────
function LandscapeProjectSheet({ phase: initialPhase, onClose, onUpdated }) {
  const [phases, setPhases]   = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // phase id being edited
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const blankForm = { title: '', date: '', time: '', notes: '', tech_ids: [] }
  const [form, setForm] = useState(blankForm)

  const contact = initialPhase.contact || {}
  const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || initialPhase.deal_title || '—'
  const address = contact.address || ''
  const mapsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null

  useEffect(() => {
    Promise.all([
      api.get('/phases/', { params: { deal_id: initialPhase.deal_id } }),
      api.get('/users/'),
    ]).then(([pr, ur]) => {
      setPhases(pr.data)
      setUsers(ur.data.filter(u => u.role === 'technician' || u.role === 'admin'))
    }).finally(() => setLoading(false))
  }, [initialPhase.deal_id])

  function reload() {
    api.get('/phases/', { params: { deal_id: initialPhase.deal_id } })
      .then(r => { setPhases(r.data); onUpdated && onUpdated() })
  }

  function startEdit(p) {
    setAdding(false)
    setEditing(p.id)
    const d = p.phase_date ? p.phase_date.slice(0, 10) : ''
    const t = p.phase_date ? (p.phase_date.slice(11, 16) || '08:00') : '08:00'
    setForm({ title: p.title, date: d, time: t, notes: p.notes || '', tech_ids: p.techs.map(x => x.id) })
  }

  function startAdd() {
    setEditing(null)
    setAdding(true)
    setForm(blankForm)
  }

  function toggleTech(uid) {
    setForm(f => ({
      ...f,
      tech_ids: f.tech_ids.includes(uid) ? f.tech_ids.filter(x => x !== uid) : [...f.tech_ids, uid],
    }))
  }

  async function savePhase() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const iso = form.date ? `${form.date}T${form.time || '08:00'}:00` : null
      if (editing) {
        await api.put(`/phases/${editing}`, { title: form.title.trim(), phase_date: iso, notes: form.notes || null, tech_ids: form.tech_ids })
      } else {
        await api.post('/phases/', { deal_id: initialPhase.deal_id, title: form.title.trim(), phase_date: iso, notes: form.notes || null, tech_ids: form.tech_ids })
      }
      setEditing(null)
      setAdding(false)
      setForm(blankForm)
      reload()
    } finally { setSaving(false) }
  }

  async function toggleStatus(p) {
    const next = p.status === 'done' ? 'todo' : 'done'
    await api.put(`/phases/${p.id}`, { status: next })
    reload()
  }

  async function deletePhase(id) {
    await api.delete(`/phases/${id}`)
    setConfirmDel(null)
    reload()
  }

  const phaseFormJSX = (
    <div className="bg-emerald-900/40 rounded-2xl p-4 space-y-3 border border-emerald-800/50">
      <input
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Step name (e.g. Site Prep, Planting…)"
        className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style={{ colorScheme: 'dark' }}
        />
        <input
          type="time"
          value={form.time}
          onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
          className="w-28 bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style={{ colorScheme: 'dark' }}
        />
      </div>
      <textarea
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        placeholder="Notes for this step…"
        rows={2}
        className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
      />
      {/* Tech picker */}
      {users.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Assign crew</p>
          <div className="flex flex-wrap gap-2">
            {users.map(u => {
              const active = form.tech_ids.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleTech(u.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    active ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${active ? 'bg-white/20' : 'bg-slate-700'}`}>
                    {(u.full_name || u.username || '?')[0].toUpperCase()}
                  </div>
                  {u.full_name || u.username}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setEditing(null); setAdding(false) }}
          className="flex-1 border border-slate-600 text-slate-400 py-2.5 rounded-xl text-sm"
        >Cancel</button>
        <button
          onClick={savePhase}
          disabled={saving || !form.title.trim()}
          className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Step'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[#050f0a] rounded-t-2xl px-4 pt-5 overflow-y-auto"
        style={{ maxHeight: '92vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <div className="w-10 h-1 bg-emerald-900 rounded-full mx-auto -mt-1 mb-4" />

        {/* Project header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Leaf size={14} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Landscape Project</span>
            </div>
            <p className="text-white font-bold text-base truncate">{clientName}</p>
            {address && <p className="text-slate-400 text-xs mt-0.5 truncate">{address}</p>}
            {initialPhase.deal_value > 0 && (
              <p className="text-slate-500 text-xs mt-0.5">${initialPhase.deal_value.toFixed(0)} total</p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 ml-3 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Contact actions */}
        {(contact.phone || mapsUrl) && (
          <div className="flex gap-2 mb-4">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-green-600/20 border border-green-600/30 text-green-400 py-2.5 rounded-xl text-sm font-semibold">
                <Phone size={14} /> Call
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-indigo-600/20 border border-indigo-600/30 text-indigo-400 py-2.5 rounded-xl text-sm font-semibold">
                <Navigation size={14} /> Directions
              </a>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="mb-3">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">Schedule</p>
          {loading ? (
            <div className="text-slate-500 text-sm py-4 text-center">Loading…</div>
          ) : phases.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">No steps yet. Add your first step below.</p>
          ) : (
            <div className="space-y-2">
              {phases.map((p, idx) => {
                const pDate = p.phase_date ? new Date(p.phase_date) : null
                const dateStr = pDate ? pDate.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'
                const timeStr = pDate ? pDate.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
                const isDone = p.status === 'done'
                return (
                  <div key={p.id}>
                    {editing === p.id ? (
                      phaseFormJSX
                    ) : (
                      <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                        isDone ? 'bg-emerald-900/40 border-emerald-700/40' : 'bg-emerald-900/20 border-emerald-800/40'
                      }`}>
                        {/* Step number / done toggle */}
                        <button
                          onClick={() => toggleStatus(p)}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isDone ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-600 text-slate-600 hover:border-indigo-500'
                          }`}
                        >
                          {isDone ? <Check size={12} /> : <span className="text-xs font-bold">{idx + 1}</span>}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isDone ? 'text-emerald-300 line-through' : 'text-white'}`}>{p.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</p>
                          {p.notes && <p className="text-xs text-slate-500 mt-1 italic">{p.notes}</p>}
                          {p.techs.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {p.techs.map(t => (
                                <span key={t.id} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-indigo-900/40 border border-indigo-700/40 rounded-full text-indigo-300">
                                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-600 flex items-center justify-center text-[7px] font-bold">
                                    {(t.full_name || t.username || '?')[0].toUpperCase()}
                                  </div>
                                  {t.full_name || t.username}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Edit / delete */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors">
                            <Pencil size={12} />
                          </button>
                          {confirmDel === p.id ? (
                            <button onClick={() => deletePhase(p.id)} className="px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 rounded-lg">
                              Delete?
                            </button>
                          ) : (
                            <button onClick={() => setConfirmDel(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add step form or button */}
        {adding ? (
          phaseFormJSX
        ) : (
          <button
            onClick={startAdd}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-600 text-slate-400 py-3 rounded-2xl text-sm font-medium hover:border-indigo-500 hover:text-indigo-400 transition-colors mt-2"
          >
            <Plus size={16} /> Add Step
          </button>
        )}
      </div>
    </div>
  )
}

// ── Phase Agenda Card (landscape mode) ────────────────────────────────────────
function PhaseAgendaCard({ phase, isAdmin, isTech, onUpdated }) {
  const [sheet, setSheet] = useState(false)
  const contact = phase.contact || {}
  const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || phase.deal_title || '—'
  const address = contact.address || ''
  const timeStr = phase.phase_date
    ? new Date(phase.phase_date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
  const isDone = phase.status === 'done'

  return (
    <>
      <button
        onClick={() => { if (isAdmin || isTech) setSheet(true) }}
        className={`w-full text-left rounded-2xl px-4 py-3 transition-opacity active:opacity-80 border ${
          isDone
            ? 'bg-emerald-900/30 border-emerald-700/30'
            : 'bg-emerald-600/15 border-emerald-700/20'
        }`}
        style={{ minHeight: '60px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Leaf size={11} className={isDone ? 'text-emerald-500' : 'text-emerald-400'} />
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDone ? 'text-emerald-500' : 'text-emerald-400'}`}>
                {phase.title}
              </p>
            </div>
            <p className={`font-semibold text-sm truncate ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>{clientName}</p>
            {timeStr && <p className="text-xs text-slate-500 mt-0.5">{timeStr}</p>}
            {address && <p className="text-xs text-slate-500 mt-0.5 truncate">{address}</p>}
            {phase.techs.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {phase.techs.map(t => (
                  <span key={t.id} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-900/40 border border-emerald-700/40 rounded-full text-emerald-300">
                    <div className="w-3 h-3 rounded-full bg-emerald-600 flex items-center justify-center text-[6px] font-bold text-white">
                      {(t.full_name || t.username || '?')[0].toUpperCase()}
                    </div>
                    {t.full_name || t.username}
                  </span>
                ))}
              </div>
            )}
          </div>
          {(isAdmin || isTech) && <Pencil size={12} className="text-slate-500 mt-1 shrink-0" />}
        </div>
      </button>

      {sheet && (
        <LandscapeProjectSheet
          phase={phase}
          onClose={() => setSheet(false)}
          onUpdated={onUpdated}
        />
      )}
    </>
  )
}

// ── Main Calendar ──────────────────────────────────────────────────────────────
export default function Calendar() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isTech  = user?.role === 'technician'

  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  const [businessType, setBusinessType] = useState('window') // 'window' | 'landscape'
  const [phases, setPhases] = useState([])
  const [phasesLoading, setPhasesLoading] = useState(false)
  const [projectPicker, setProjectPicker] = useState(false)
  const [approvedProjects, setApprovedProjects] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [scheduleTarget, setScheduleTarget] = useState(null) // synthetic phase obj for LandscapeProjectSheet

  const loadPhases = useCallback(() => {
    setPhasesLoading(true)
    api.get('/phases/')
      .then(r => setPhases(r.data))
      .finally(() => setPhasesLoading(false))
  }, [])

  useEffect(() => {
    if (businessType === 'landscape') loadPhases()
  }, [businessType, loadPhases])

  function openProjectPicker() {
    setProjectPicker(true)
    setPickerLoading(true)
    api.get('/deals/', { params: { limit: 200, business_type: 'landscape' } })
      .then(r => setApprovedProjects(r.data.filter(d => d.stage === 'won')))
      .finally(() => setPickerLoading(false))
  }

  // Drag state
  const [draggingDealId, setDraggingDealId] = useState(null)
  const [dragOverDate, setDragOverDate]     = useState(undefined)
  const [viewMode, setViewMode]             = useState('agenda') // 'agenda' | 'grid'

  // Tech clock status map: { dealId: 'in' | 'out' }
  const [techClockMap, setTechClockMap] = useState({})

  const load = useCallback(() => {
    api.get('/deals/', { params: { limit: 1000 } })
      .then(r => setDeals(r.data.filter(d => d.expected_close_date && d.job_status !== 'cancelled')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Load today's clock status for technicians (batch, all deals at once)
  useEffect(() => {
    if (!isTech) return
    const todayStr = new Date().toLocaleDateString('en-CA')
    api.get('/timeclock/', { params: { date: todayStr } })
      .then(r => {
        const map = {}
        for (const e of r.data) {
          if (e.deal_id) map[e.deal_id] = e.clock_type // last entry wins (sorted asc)
        }
        setTechClockMap(map)
      })
      .catch(() => {})
  }, [isTech])

  function updateTechClock(dealId, clockType) {
    setTechClockMap(prev => ({ ...prev, [dealId]: clockType }))
  }

  async function updateStatus(dealId, jobStatus) {
    if (!isAdmin) return
    await api.patch(`/deals/${dealId}/job-status`, null, { params: { job_status: jobStatus } })
    // Remove cancelled jobs from calendar immediately
    if (jobStatus === 'cancelled') {
      setDeals(prev => prev.filter(d => d.id !== dealId))
    } else {
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, job_status: jobStatus } : d))
    }
  }

  function rescheduleLocal(dealId, newIso) {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, expected_close_date: newIso } : d))
  }

  function deleteDealLocal(dealId) {
    setDeals(prev => prev.filter(d => d.id !== dealId))
  }

  // Drop a deal onto a new date — keeps original time
  async function dropDeal(dealId, newDateStr) {
    if (!isAdmin) return
    const deal = deals.find(d => d.id === dealId)
    if (!deal || !newDateStr) return

    const origTime = (deal.expected_close_date || '').slice(11, 16) || '09:00'
    const newIso   = `${newDateStr}T${origTime}:00`

    // Optimistic update
    rescheduleLocal(dealId, newIso)

    try {
      await api.put(`/deals/${dealId}`, { ...deal, expected_close_date: newIso, contact_id: deal.contact_id })
    } catch {
      rescheduleLocal(dealId, deal.expected_close_date) // revert on error
    }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const daysInMonth    = getDaysInMonth(year, month)
  const firstDayOfWeek = getFirstDayOfWeek(year, month)
  const totalCells     = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7

  const visibleDeals = deals.filter(d => (d.business_type || 'window') === businessType)

  const dealsByDate = {}
  visibleDeals.forEach(d => {
    const key = fmt(new Date(d.expected_close_date))
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  })

  const monthDeals = visibleDeals.filter(d => {
    const dt = new Date(d.expected_close_date)
    return dt.getFullYear() === year && dt.getMonth() === month
  })

  const counts = Object.fromEntries(JOB_STATUSES.map(s => [
    s.key, monthDeals.filter(d => (d.job_status || 'todo') === s.key).length
  ]))
  const monthRevenue  = monthDeals.filter(d => d.job_status === 'done').reduce((s, d) => s + (d.value || 0), 0)
  const monthPipeline = monthDeals.reduce((s, d) => s + (d.value || 0), 0)
  const todayStr   = fmt(today)
  const allDeals   = [...visibleDeals].sort((a,b) => new Date(a.expected_close_date) - new Date(b.expected_close_date))

  // Agenda: group month deals by date, sorted
  const agendaDays = Object.entries(
    monthDeals.reduce((acc, d) => {
      const key = fmt(new Date(d.expected_close_date))
      if (!acc[key]) acc[key] = []
      acc[key].push(d)
      return acc
    }, {})
  ).sort(([a], [b]) => new Date(a) - new Date(b))

  // Landscape phases — grouped by month + date
  const monthPhases = phases.filter(p => {
    if (!p.phase_date) return false
    const dt = new Date(p.phase_date)
    return dt.getFullYear() === year && dt.getMonth() === month
  })
  const landscapeAgendaDays = Object.entries(
    monthPhases.reduce((acc, p) => {
      const key = fmt(new Date(p.phase_date))
      if (!acc[key]) acc[key] = []
      acc[key].push(p)
      return acc
    }, {})
  ).sort(([a], [b]) => new Date(a) - new Date(b))
  const landscapePhaseCounts = {
    todo: monthPhases.filter(p => (p.status || 'todo') === 'todo').length,
    done: monthPhases.filter(p => p.status === 'done').length,
  }

  const phasesByDate = monthPhases.reduce((acc, p) => {
    const key = fmt(new Date(p.phase_date))
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className={`flex flex-col transition-colors ${businessType === 'landscape' ? 'bg-[#050f0a]' : ''}`} style={{ height: '100%' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Calendar</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {businessType === 'landscape' ? `${monthPhases.length} steps scheduled` : `${monthDeals.length} appointments`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Schedule project button — landscape + admin only */}
          {businessType === 'landscape' && isAdmin && (
            <button
              onClick={openProjectPicker}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <Plus size={14} /> Schedule
            </button>
          )}
          {/* View toggle — mobile only */}
          <button
            onClick={() => setViewMode(v => v === 'agenda' ? 'grid' : 'agenda')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 md:hidden"
            aria-label="Toggle view"
          >
            {viewMode === 'agenda' ? <LayoutGrid size={16} /> : <List size={16} />}
          </button>
          <button onClick={prevMonth} className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 active:bg-slate-700">
            <ChevronLeft size={18} />
          </button>
          <span className="text-white font-semibold text-sm min-w-[110px] text-center">
            {MONTHS[month].slice(0,3)} {year}
          </span>
          <button onClick={nextMonth} className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 active:bg-slate-700">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Business toggle ── */}
      <div className="flex gap-2 px-4 mb-3 flex-shrink-0">
        {[{ v: 'window', label: 'Window Cleaning' }, { v: 'landscape', label: 'Landscape' }].map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setBusinessType(v)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
              businessType === v
                ? v === 'landscape' ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-indigo-600 border-indigo-500 text-white'
                : businessType === 'landscape' ? 'bg-emerald-900/40 border-emerald-800/50 text-emerald-300 active:bg-emerald-900/60' : 'bg-slate-900 border-slate-700 text-slate-400 active:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Stats pills (scrollable) ── */}
      {businessType === 'landscape' ? (
        <div className="flex gap-2 px-4 mb-3 overflow-x-auto flex-shrink-0 pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700/50 bg-slate-800/50 text-xs font-semibold text-slate-400 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> To Do {landscapePhaseCounts.todo}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-700/40 bg-emerald-900/30 text-xs font-semibold text-emerald-300 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Done {landscapePhaseCounts.done}
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-700/50 bg-slate-800/50 text-xs font-semibold text-emerald-400 whitespace-nowrap">
            <DollarSign size={11} />${monthRevenue.toFixed(0)}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 px-4 mb-3 overflow-x-auto flex-shrink-0 pb-1 scrollbar-none">
          {JOB_STATUSES.map(s => (
            <div key={s.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap ${s.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {s.label} {counts[s.key]}
            </div>
          ))}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-700/50 bg-slate-800/50 text-xs font-semibold text-emerald-400 whitespace-nowrap">
            <DollarSign size={11} />${monthRevenue.toFixed(0)}
          </div>
        </div>
      )}

      {(loading || (businessType === 'landscape' && phasesLoading)) ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* ── AGENDA VIEW (mobile default) ── */}
          <div className={`flex-1 overflow-y-auto px-4 pb-2 ${viewMode === 'agenda' ? 'block md:hidden' : 'hidden'}`}>
            {businessType === 'landscape' ? (
              landscapeAgendaDays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                  <Leaf size={36} className="mb-3 opacity-30" />
                  <p className="text-sm">No landscape steps this month</p>
                  <p className="text-xs mt-1 opacity-70">Create a landscape booking and add steps to it</p>
                </div>
              ) : landscapeAgendaDays.map(([dateStr, dayPhases]) => {
                const [_y, _m, _d] = dateStr.split('-').map(Number)
                const dt = new Date(_y, _m - 1, _d)
                const isToday = dateStr === todayStr
                const isPast  = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <div key={dateStr} className="mb-3">
                    <div className={`flex items-center gap-2 mb-2 ${isPast ? 'opacity-50' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isToday ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {dt.getDate()}
                      </div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {dt.toLocaleDateString('en-CA', { weekday: 'long', month: 'short' })}
                      </span>
                    </div>
                    <div className="space-y-2 ml-10">
                      {dayPhases.map(phase => (
                        <PhaseAgendaCard
                          key={phase.id}
                          phase={phase}
                          isAdmin={isAdmin}
                          isTech={isTech}
                          onUpdated={loadPhases}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              agendaDays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                  <CalendarDays size={40} className="mb-3 opacity-40" />
                  <p className="text-sm">No appointments this month</p>
                </div>
              ) : agendaDays.map(([dateStr, dayDeals]) => {
                const [_y, _m, _d] = dateStr.split('-').map(Number)
                const dt = new Date(_y, _m - 1, _d)
                const isToday = dateStr === todayStr
                const isPast  = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <div key={dateStr} className="mb-3">
                    <div className={`flex items-center gap-2 mb-2 ${isPast ? 'opacity-50' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isToday ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {dt.getDate()}
                      </div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {dt.toLocaleDateString('en-CA', { weekday: 'long', month: 'short' })}
                      </span>
                    </div>
                    <div className="space-y-2 ml-10">
                      {dayDeals.map(deal => {
                        const s = STATUS_MAP[deal.job_status] || STATUS_MAP.todo
                        const name = deal.contact
                          ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
                          : deal.title
                        const time = new Date(deal.expected_close_date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
                        return (
                          <AgendaCard
                            key={deal.id}
                            deal={deal}
                            allDeals={allDeals}
                            name={name}
                            time={time}
                            s={s}
                            isAdmin={isAdmin}
                            isTech={isTech}
                            onUpdate={updateStatus}
                            onReschedule={rescheduleLocal}
                            onDelete={deleteDealLocal}
                            clockedIn={techClockMap[deal.id] === 'in'}
                            onClockToggle={updateTechClock}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ── GRID VIEW (desktop default, mobile optional) ── */}
          <div className={`flex-1 flex flex-col min-h-0 mx-4 mb-3 rounded-2xl overflow-hidden ${businessType === 'landscape' ? 'bg-[#050f0a] border border-emerald-900/30' : 'bg-slate-900 border border-slate-700/50'} ${viewMode === 'grid' ? 'block' : 'hidden md:flex md:flex-col'}`}>
            <div className={`grid grid-cols-7 border-b flex-shrink-0 ${businessType === 'landscape' ? 'bg-[#050f0a] border-emerald-900/30' : 'border-slate-700/50'}`}>
              {DAYS.map(d => (
                <div key={d} className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wide ${businessType === 'landscape' ? 'text-emerald-500' : 'text-slate-500'}`}>{d.slice(0,1)}</div>
              ))}
            </div>
            <div
              className="grid grid-cols-7 flex-1 overflow-y-auto"
              style={{ gridAutoRows: 'minmax(70px, 1fr)' }}
              onDragEnd={() => { setDraggingDealId(null); setDragOverDate(undefined) }}
            >
              {Array.from({ length: totalCells }, (_, i) => {
                const dayNum  = i - firstDayOfWeek + 1
                const isValid = dayNum >= 1 && dayNum <= daysInMonth
                const dateStr = isValid
                  ? `${year}-${String(month + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
                  : null
                const dayDeals = dateStr ? (dealsByDate[dateStr] || []) : []
                const isToday  = dateStr === todayStr
                const isPast   = isValid && new Date(year, month, dayNum) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <div key={i} style={{ position: 'relative' }}>
                    <DayCell
                      dayNum={dayNum}
                      dateStr={dateStr}
                      isValid={isValid}
                      isToday={isToday}
                      isPast={isPast}
                      deals={dayDeals}
                      isDragOver={dragOverDate === dateStr}
                      draggingDealId={draggingDealId}
                      allDeals={allDeals}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverDate(dateStr) }}
                      onDragLeave={() => setDragOverDate(undefined)}
                      onDrop={e => {
                        e.preventDefault()
                        const dealId = parseInt(e.dataTransfer.getData('dealId'))
                        if (dealId && dateStr) dropDeal(dealId, dateStr)
                        setDraggingDealId(null)
                        setDragOverDate(undefined)
                      }}
                      onUpdate={updateStatus}
                      onReschedule={rescheduleLocal}
                      onDragStart={id => setDraggingDealId(id)}
                      onDragEnd={() => { setDraggingDealId(null); setDragOverDate(undefined) }}
                      isAdmin={isAdmin}
                      isTech={isTech}
                      isLandscape={businessType === 'landscape'}
                      landscapePhases={businessType === 'landscape' ? (phasesByDate[dateStr] || []) : []}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Legend ── */}
          <div className="px-4 pb-2 flex-shrink-0 hidden md:block">
            <span className="text-xs text-slate-600">
              {isAdmin ? 'Click to change status · Drag to reschedule' : isTech ? 'Tap any appointment to view details & clock in/out' : 'View only'}
            </span>
          </div>
        </>
      )}

      {/* ── Project picker sheet ── */}
      {projectPicker && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setProjectPicker(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl px-4 pt-5 overflow-y-auto"
            style={{ maxHeight: '80vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto -mt-1 mb-4" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white font-bold text-base">Approved Projects</p>
                <p className="text-slate-500 text-xs mt-0.5">Tap a project to schedule its steps</p>
              </div>
              <button onClick={() => setProjectPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
                <X size={16} />
              </button>
            </div>
            {pickerLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading…
              </div>
            ) : approvedProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                <Leaf size={32} className="mb-3 opacity-30" />
                <p className="text-sm text-center">No approved projects yet.</p>
                <p className="text-xs text-slate-600 mt-1 text-center">Move a lead to Construction in the Landscape Pipeline first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {approvedProjects.map(deal => {
                  const contact = deal.contact || {}
                  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || deal.title
                  const services = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)
                  return (
                    <button key={deal.id} onClick={() => {
                      setProjectPicker(false)
                      setScheduleTarget({
                        deal_id: deal.id,
                        deal_title: deal.title,
                        deal_value: deal.value,
                        contact: deal.contact,
                      })
                    }}
                      className="w-full text-left bg-slate-800 border border-slate-700/50 rounded-2xl px-4 py-3 active:bg-slate-700 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-white font-semibold text-sm">{name}</p>
                        {deal.value > 0 && <span className="text-emerald-400 text-xs font-bold">${deal.value.toFixed(0)}</span>}
                      </div>
                      {contact.address && <p className="text-slate-500 text-xs truncate mb-1.5">{contact.address}</p>}
                      {services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {services.map(svc => (
                            <span key={svc} className="text-[10px] px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/30 rounded-full text-emerald-400">
                              {svc.replace('pavers-', 'Pavers ').replace('-', ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Schedule sheet for picked project ── */}
      {scheduleTarget && (
        <LandscapeProjectSheet
          phase={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
          onUpdated={loadPhases}
        />
      )}
    </div>
  )
}

// ── Agenda Card (mobile list item) ─────────────────────────────────────────────
function AgendaCard({ deal, allDeals, name, time, s, isAdmin, isTech, onUpdate, onReschedule, onDelete, clockedIn, onClockToggle }) {
  const [techModal, setTechModal] = useState(false)
  const [sheet, setSheet]         = useState(false) // admin action sheet
  const [clocking, setClocking]   = useState(false)

  const assignedCount  = deal.assigned_techs?.length || 0
  const understaffed   = isAdmin && assignedCount < requiredTechs(deal)
  const cardBg   = understaffed ? 'bg-amber-400'  : s.color
  const cardText = understaffed ? 'text-amber-900' : s.text

  // Reschedule state inside the sheet
  const [newDate, setNewDate] = useState((deal.expected_close_date || '').slice(0, 10))
  const [newTime, setNewTime] = useState((deal.expected_close_date || '').slice(11, 16) || '09:00')
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  async function handleReschedule() {
    if (!newDate) return
    setSaving(true)
    try {
      const iso = `${newDate}T${newTime || '09:00'}:00`
      await api.put(`/deals/${deal.id}`, { ...deal, expected_close_date: iso, contact_id: deal.contact_id })
      onReschedule(deal.id, iso)
      setSheet(false)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/deals/${deal.id}`)
      onDelete(deal.id)
      setSheet(false)
    } catch { setDeleting(false) }
  }

  function openSheet() {
    setNewDate((deal.expected_close_date || '').slice(0, 10))
    setNewTime((deal.expected_close_date || '').slice(11, 16) || '09:00')
    setConfirmDel(false)
    setSheet(true)
  }

  async function handleClockTap(e) {
    e.stopPropagation()
    if (clocking) return
    setClocking(true)
    try {
      const type = clockedIn ? 'out' : 'in'
      await api.post('/timeclock/', { clock_type: type, deal_id: deal.id })
      onClockToggle(deal.id, type)
    } finally { setClocking(false) }
  }

  return (
    <>
      {/* Tech card: main area opens modal, clock button on the right */}
      {isTech ? (
        <div className={`flex rounded-2xl overflow-hidden ${s.color}`} style={{ minHeight: '60px' }}>
          <button
            onClick={() => setTechModal(true)}
            className="flex-1 text-left px-4 py-3 active:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 mr-2">
                <p className={`font-semibold text-sm truncate ${s.text}`}>{name}</p>
                <p className={`text-xs mt-0.5 opacity-80 ${s.text}`}>
                  {time} {deal.value > 0 ? `· $${deal.value.toFixed(0)}` : ''}
                </p>
              </div>
              <ExternalLink size={14} className={`opacity-60 flex-shrink-0 ${s.text}`} />
            </div>
            {deal.contact?.address && (
              <p className={`text-xs mt-1 opacity-60 truncate ${s.text}`}>{deal.contact.address}</p>
            )}
          </button>
          {/* Inline clock button */}
          <button
            onClick={handleClockTap}
            disabled={clocking}
            className={`flex flex-col items-center justify-center px-3 gap-0.5 border-l transition-colors disabled:opacity-50 ${
              clockedIn
                ? 'border-amber-500/30 bg-amber-500/20 text-amber-200'
                : 'border-white/10 bg-white/10 text-white/80'
            }`}
            style={{ minWidth: '56px' }}
            title={clockedIn ? 'Clock Out' : 'Clock In'}
          >
            {clocking
              ? <Loader2 size={16} className="animate-spin" />
              : clockedIn
                ? <LogOut size={16} />
                : <LogIn size={16} />
            }
            <span className="text-[9px] font-semibold leading-none mt-0.5">
              {clockedIn ? 'OUT' : 'IN'}
            </span>
          </button>
        </div>
      ) : (
      <>
      <button
        onClick={() => { if (isAdmin) openSheet() }}
        className={`w-full text-left rounded-2xl px-4 py-3 ${cardBg} active:opacity-80 transition-opacity`}
        style={{ minHeight: '60px' }}
        aria-label={`${name} appointment at ${time}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-2">
            <p className={`font-semibold text-sm truncate ${cardText}`}>{name}</p>
            <p className={`text-xs mt-0.5 opacity-80 ${cardText}`}>
              {time}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {understaffed
              ? <span className={`text-xs font-bold ${cardText}`}>
                  {assignedCount === 0 ? '⚠ No tech' : `⚠ Need ${requiredTechs(deal) - assignedCount} more`}
                </span>
              : <span className={`text-xs font-medium opacity-80 ${cardText}`}>{s.label}</span>
            }
            {isAdmin && <Pencil size={12} className={`opacity-50 ${cardText}`} />}
            {!isAdmin && <Lock size={12} className={`opacity-40 ${cardText}`} />}
          </div>
        </div>
        {deal.contact?.address && (
          <p className={`text-xs mt-1 opacity-60 truncate ${cardText}`}>{deal.contact.address}</p>
        )}
      </button>

      {/* Admin action bottom sheet */}
      {sheet && isAdmin && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setSheet(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl px-4 pt-5 space-y-4 overflow-y-auto"
            style={{ maxHeight: '90vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          >
            {/* Handle + header */}
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-base truncate">{name}</p>
                <p className="text-slate-400 text-xs">{time} {deal.value > 0 ? `· $${deal.value.toFixed(0)}` : ''}</p>
              </div>
              <button onClick={() => setSheet(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
                <X size={16} />
              </button>
            </div>

            {/* Service section */}
            {deal.contact?.services && (
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Service</p>
                <div className="bg-slate-800 rounded-2xl px-4 py-3 flex flex-wrap gap-2">
                  {deal.contact.services.split(',').map(s => s.trim()).filter(Boolean).map(svc => (
                    <span key={svc} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 border border-indigo-600/30 text-indigo-300 text-sm font-medium">
                      <Wrench size={13} className="shrink-0" />
                      {SERVICE_LABELS[svc] || svc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact section */}
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Contact</p>
              <div className="bg-slate-800 rounded-2xl overflow-hidden">
                {deal.contact?.phone ? (
                  <a href={`tel:${deal.contact.phone}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-700 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-green-600/20 flex items-center justify-center shrink-0">
                      <Phone size={16} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs mb-0.5">Phone</p>
                      <p className="text-white font-semibold text-base">{deal.contact.phone}</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                      <Phone size={16} className="text-slate-500" />
                    </div>
                    <p className="text-slate-500 text-sm">No phone on file</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status section */}
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Status</p>
              <div className="grid grid-cols-2 gap-2">
                {JOB_STATUSES.map(st => (
                  <button
                    key={st.key}
                    onClick={() => { onUpdate(deal.id, st.key); setSheet(false) }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-opacity ${
                      deal.job_status === st.key
                        ? `${st.color} ${st.text} ring-2 ring-white/30`
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reschedule section */}
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Reschedule</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ colorScheme: 'dark' }}
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-28 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <button
                onClick={handleReschedule}
                disabled={saving || !newDate}
                className="w-full mt-2 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CalendarDays size={15} />
                {saving ? 'Saving…' : 'Save New Time'}
              </button>
            </div>

            {/* Delete section */}
            <div className="border-t border-slate-800 pt-3">
              {confirmDel ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDel(false)} className="flex-1 border border-slate-700 text-slate-400 py-2.5 rounded-xl text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={15} />
                    {deleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDel(true)}
                  className="w-full flex items-center justify-center gap-2 text-red-400 py-2.5 rounded-xl text-sm font-medium bg-red-500/10"
                >
                  <Trash2 size={15} />
                  Delete Appointment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {techModal && (
        <TechJobModal deal={deal} allDeals={allDeals} onClose={() => setTechModal(false)} onClockAction={() => {}} />
      )}
    </>
  )
}
