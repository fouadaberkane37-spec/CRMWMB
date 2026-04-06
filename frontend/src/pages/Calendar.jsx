import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api.js'
import { ChevronLeft, ChevronRight, DollarSign } from 'lucide-react'

// ── Job status config ──────────────────────────────────────────────────────────
const JOB_STATUSES = [
  { key: 'todo',            label: 'To Do',           color: 'bg-indigo-500',  text: 'text-white',         dot: 'bg-indigo-400',  badge: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50' },
  { key: 'payment_pending', label: 'Payment Pending', color: 'bg-amber-500',   text: 'text-white',         dot: 'bg-amber-400',   badge: 'bg-amber-900/50 text-amber-300 border-amber-700/50'   },
  { key: 'done',            label: 'Done',            color: 'bg-emerald-500', text: 'text-white',         dot: 'bg-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  { key: 'cancelled',       label: 'Cancelled',       color: 'bg-slate-600',   text: 'text-slate-300',     dot: 'bg-slate-500',   badge: 'bg-slate-800 text-slate-400 border-slate-700/50'      },
]

const STATUS_MAP = Object.fromEntries(JOB_STATUSES.map(s => [s.key, s]))

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmt(date) {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay()
}

// ── Status dropdown (popup) ────────────────────────────────────────────────────
function StatusMenu({ deal, onUpdate, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
        <button
          key={s.key}
          onClick={() => { onUpdate(deal.id, s.key); onClose() }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-slate-800 ${
            deal.job_status === s.key ? 'text-white' : 'text-slate-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
          {s.label}
          {deal.job_status === s.key && (
            <span className="ml-auto text-indigo-400 text-xs">✓</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Deal chip ──────────────────────────────────────────────────────────────────
function DealChip({ deal, onUpdate }) {
  const [open, setOpen] = useState(false)
  const s = STATUS_MAP[deal.job_status] || STATUS_MAP.todo

  const time = deal.expected_close_date
    ? new Date(deal.expected_close_date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  const clientName = deal.contact
    ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
    : deal.title

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className={`w-full text-left px-1.5 py-1 rounded-md text-xs font-medium leading-tight transition-opacity hover:opacity-90 ${s.color} ${s.text}`}
        title={`${clientName} — $${deal.value}`}
      >
        {time && <span className="opacity-75 mr-1">{time}</span>}
        <span className="truncate">{clientName}</span>
      </button>
      {open && (
        <StatusMenu deal={deal} onUpdate={onUpdate} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

// ── Main Calendar ──────────────────────────────────────────────────────────────
export default function Calendar() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api.get('/deals/', { params: { limit: 1000 } })
      .then(r => setDeals(r.data.filter(d => d.expected_close_date)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(dealId, jobStatus) {
    await api.patch(`/deals/${dealId}/job-status`, null, { params: { job_status: jobStatus } })
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, job_status: jobStatus } : d))
  }

  // Navigate months
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Build calendar grid
  const daysInMonth  = getDaysInMonth(year, month)
  const firstDayOfWeek = getFirstDayOfWeek(year, month)
  const totalCells   = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7

  // Index deals by date string YYYY-MM-DD
  const dealsByDate = {}
  deals.forEach(d => {
    const key = fmt(new Date(d.expected_close_date))
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  })

  // Month-level deals (for this month's summary)
  const monthDeals = deals.filter(d => {
    const dt = new Date(d.expected_close_date)
    return dt.getFullYear() === year && dt.getMonth() === month
  })

  const counts = Object.fromEntries(JOB_STATUSES.map(s => [
    s.key,
    monthDeals.filter(d => (d.job_status || 'todo') === s.key).length
  ]))
  const monthRevenue = monthDeals
    .filter(d => (d.job_status || 'todo') === 'done')
    .reduce((sum, d) => sum + (d.value || 0), 0)
  const monthPipeline = monthDeals.reduce((sum, d) => sum + (d.value || 0), 0)

  const todayStr = fmt(today)

  return (
    <div className="p-6 h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Calendar</h1>
          <p className="text-slate-500 text-sm mt-0.5">{monthDeals.length} appointments this month</p>
        </div>
        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-white font-semibold text-base min-w-[150px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex gap-3 mb-4 flex-shrink-0 flex-wrap">
        {JOB_STATUSES.map(s => (
          <div key={s.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${s.badge}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
            <span className="font-bold ml-0.5">{counts[s.key]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700/50 bg-slate-800/50 text-xs font-medium text-slate-300 ml-auto">
          <DollarSign size={12} className="text-emerald-400" />
          <span className="text-emerald-400 font-bold">${monthRevenue.toFixed(0)}</span>
          <span className="text-slate-500">collected · pipeline ${monthPipeline.toFixed(0)}</span>
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-700/50 flex-shrink-0">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 flex-1 overflow-y-auto" style={{ gridAutoRows: 'minmax(80px, 1fr)' }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDayOfWeek + 1
              const isValid = dayNum >= 1 && dayNum <= daysInMonth
              const dateStr = isValid
                ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                : null
              const dayDeals = dateStr ? (dealsByDate[dateStr] || []) : []
              const isToday = dateStr === todayStr
              const isPast  = isValid && new Date(year, month, dayNum) < new Date(today.getFullYear(), today.getMonth(), today.getDate())

              return (
                <div
                  key={i}
                  className={`border-b border-r border-slate-700/30 p-1.5 flex flex-col gap-1 ${
                    !isValid ? 'bg-slate-900/30' : isPast ? 'bg-slate-900/60' : 'bg-slate-900'
                  }`}
                >
                  {isValid && (
                    <span className={`text-xs font-semibold self-start w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : isPast ? 'text-slate-600' : 'text-slate-400'
                    }`}>
                      {dayNum}
                    </span>
                  )}
                  {dayDeals.map(deal => (
                    <DealChip key={deal.id} deal={deal} onUpdate={updateStatus} />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 mt-3 flex-shrink-0">
        <span className="text-xs text-slate-600">Click any appointment to change its status</span>
        <div className="flex items-center gap-3 ml-auto">
          {JOB_STATUSES.map(s => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
