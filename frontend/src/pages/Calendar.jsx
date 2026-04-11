import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { ChevronLeft, ChevronRight, DollarSign, CalendarDays, Clock, X, Lock,
         Phone, Mail, MapPin, Navigation, Timer, CheckCircle, MessageSquare,
         ClipboardList, AlertCircle, ChevronDown, ExternalLink, LogIn, LogOut,
         List, LayoutGrid, Trash2, Pencil } from 'lucide-react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
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

          {/* Pricing */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign size={12} /> Pricing & Billing
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Quoted Price</p>
                <p className="text-xl font-bold text-emerald-400">${(deal.value || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Payment Status</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${statusColor}`}>{s.label}</span>
              </div>
            </div>
          </div>

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
          className={`w-full text-left px-1.5 py-1 rounded-md text-xs font-medium leading-tight ${s.color} ${s.text} ${!isAdmin && !isTech ? 'cursor-default' : ''}`}
          title={isAdmin ? `${clientName} — $${deal.value} · Click to change status` : clientName}
        >
          {time && <span className="opacity-75 mr-1">{time}</span>}
          <span className="truncate">{clientName}</span>
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
function DayCell({ dayNum, dateStr, isValid, isToday, isPast, deals, allDeals, isDragOver, onDragOver, onDragLeave, onDrop, onUpdate, onReschedule, onDragStart, onDragEnd, draggingDealId, isAdmin, isTech }) {
  return (
    <div
      className={`border-b border-r border-slate-700/30 p-1.5 flex flex-col gap-1 transition-colors ${
        !isValid   ? 'bg-slate-900/30' :
        isDragOver ? 'bg-indigo-900/25 border-indigo-500/60' :
        isPast     ? 'bg-slate-900/60' : 'bg-slate-900'
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
          isToday ? 'bg-indigo-600 text-white' : isPast ? 'text-slate-600' : 'text-slate-400'
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
    </div>
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

  // Drag state
  const [draggingDealId, setDraggingDealId] = useState(null)
  const [dragOverDate, setDragOverDate]     = useState(undefined)
  const [viewMode, setViewMode]             = useState('agenda') // 'agenda' | 'grid'

  const load = useCallback(() => {
    api.get('/deals/', { params: { limit: 1000 } })
      .then(r => setDeals(r.data.filter(d => d.expected_close_date)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(dealId, jobStatus) {
    if (!isAdmin) return
    await api.patch(`/deals/${dealId}/job-status`, null, { params: { job_status: jobStatus } })
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, job_status: jobStatus } : d))
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

  const dealsByDate = {}
  deals.forEach(d => {
    const key = fmt(new Date(d.expected_close_date))
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  })

  const monthDeals = deals.filter(d => {
    const dt = new Date(d.expected_close_date)
    return dt.getFullYear() === year && dt.getMonth() === month
  })

  const counts = Object.fromEntries(JOB_STATUSES.map(s => [
    s.key, monthDeals.filter(d => (d.job_status || 'todo') === s.key).length
  ]))
  const monthRevenue  = monthDeals.filter(d => d.job_status === 'done').reduce((s, d) => s + (d.value || 0), 0)
  const monthPipeline = monthDeals.reduce((s, d) => s + (d.value || 0), 0)
  const todayStr   = fmt(today)
  const allDeals   = [...deals].sort((a,b) => new Date(a.expected_close_date) - new Date(b.expected_close_date))

  // Agenda: group month deals by date, sorted
  const agendaDays = Object.entries(
    monthDeals.reduce((acc, d) => {
      const key = fmt(new Date(d.expected_close_date))
      if (!acc[key]) acc[key] = []
      acc[key].push(d)
      return acc
    }, {})
  ).sort(([a], [b]) => new Date(a) - new Date(b))

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Calendar</h1>
          <p className="text-slate-500 text-xs mt-0.5">{monthDeals.length} appointments</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* ── Stats pills (scrollable) ── */}
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

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* ── AGENDA VIEW (mobile default) ── */}
          <div className={`flex-1 overflow-y-auto px-4 pb-2 ${viewMode === 'agenda' ? 'block md:hidden' : 'hidden'}`}>
            {agendaDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                <CalendarDays size={40} className="mb-3 opacity-40" />
                <p className="text-sm">No appointments this month</p>
              </div>
            ) : agendaDays.map(([dateStr, dayDeals]) => {
              // Parse as local time (not UTC midnight) to avoid off-by-one on dates
              const [_y, _m, _d] = dateStr.split('-').map(Number)
              const dt = new Date(_y, _m - 1, _d)
              const isToday = dateStr === todayStr
              const isPast  = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <div key={dateStr} className="mb-3">
                  {/* Date header */}
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
                  {/* Deal cards */}
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
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── GRID VIEW (desktop default, mobile optional) ── */}
          <div className={`flex-1 flex flex-col min-h-0 mx-4 mb-3 bg-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden ${viewMode === 'grid' ? 'block' : 'hidden md:flex md:flex-col'}`}>
            <div className="grid grid-cols-7 border-b border-slate-700/50 flex-shrink-0">
              {DAYS.map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{d.slice(0,1)}</div>
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
    </div>
  )
}

// ── Agenda Card (mobile list item) ─────────────────────────────────────────────
function AgendaCard({ deal, allDeals, name, time, s, isAdmin, isTech, onUpdate, onReschedule, onDelete }) {
  const [techModal, setTechModal] = useState(false)
  const [sheet, setSheet]         = useState(false) // admin action sheet

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
    // Reset reschedule fields to current deal time each time sheet opens
    setNewDate((deal.expected_close_date || '').slice(0, 10))
    setNewTime((deal.expected_close_date || '').slice(11, 16) || '09:00')
    setConfirmDel(false)
    setSheet(true)
  }

  return (
    <>
      <button
        onClick={() => { if (isTech) setTechModal(true); else if (isAdmin) openSheet() }}
        className={`w-full text-left rounded-2xl px-4 py-3 ${s.color} active:opacity-80 transition-opacity`}
        style={{ minHeight: '60px' }}
        aria-label={`${name} appointment at ${time}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-2">
            <p className={`font-semibold text-sm truncate ${s.text}`}>{name}</p>
            <p className={`text-xs mt-0.5 opacity-80 ${s.text}`}>
              {time} {deal.value > 0 ? `· $${deal.value.toFixed(0)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-medium opacity-80 ${s.text}`}>{s.label}</span>
            {isAdmin && <Pencil size={12} className={`opacity-50 ${s.text}`} />}
            {isTech && <ExternalLink size={14} className={`opacity-60 ${s.text}`} />}
            {!isAdmin && !isTech && <Lock size={12} className={`opacity-40 ${s.text}`} />}
          </div>
        </div>
        {deal.contact?.address && (
          <p className={`text-xs mt-1 opacity-60 truncate ${s.text}`}>{deal.contact.address}</p>
        )}
      </button>

      {/* Admin action bottom sheet */}
      {sheet && isAdmin && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setSheet(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl px-4 pt-5 space-y-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
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

      {techModal && (
        <TechJobModal deal={deal} allDeals={allDeals} onClose={() => setTechModal(false)} />
      )}
    </>
  )
}
