import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import {
  ClipboardList, ChevronLeft, ChevronRight, Loader2,
  User, CheckCircle2, Circle, AlertCircle, XCircle, RefreshCw,
  ChevronDown, MapPin, DollarSign,
} from 'lucide-react'

const DAY_KEYS   = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function weekMonday(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  return d.toLocaleDateString('en-CA')
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
function fmtShort(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
function fmtFull(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })
}

const STATUS_OPTIONS = [
  { value: 'todo',            label: 'Scheduled',  color: 'bg-indigo-600',  icon: Circle },
  { value: 'payment_pending', label: 'Pending $',  color: 'bg-amber-500',   icon: AlertCircle },
  { value: 'done',            label: 'Done',       color: 'bg-emerald-600', icon: CheckCircle2 },
  { value: 'cancelled',       label: 'Cancelled',  color: 'bg-red-600',     icon: XCircle },
]

function statusMeta(s) {
  return STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0]
}

/** A bottom sheet picker for assigning a tech to a job */
function AssignSheet({ deal, availableTechs, allTechs, onAssign, onClose }) {
  const [saving, setSaving] = useState(false)

  async function pick(techId) {
    setSaving(true)
    try {
      await onAssign(deal.id, techId)
      onClose()
    } finally { setSaving(false) }
  }

  const dateStr = deal.expected_close_date?.slice(0, 10) || ''
  const dayLabel = dateStr ? fmtFull(dateStr) : ''

  // sort: available + confirmed first, available second, rest last
  const sorted = [...allTechs].sort((a, b) => {
    const scoreA = (availableTechs.find(t => t.id === a.id)?.confirmed ? 2 : availableTechs.find(t => t.id === a.id)?.available ? 1 : 0)
    const scoreB = (availableTechs.find(t => t.id === b.id)?.confirmed ? 2 : availableTechs.find(t => t.id === b.id)?.available ? 1 : 0)
    return scoreB - scoreA
  })

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-slate-900 rounded-t-3xl px-4 pt-5 pb-8"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
        <p className="text-white font-semibold text-base mb-0.5">Assign Technician</p>
        <p className="text-slate-400 text-xs mb-4">{deal.title} · {dayLabel}</p>

        <div className="space-y-2">
          {/* Unassign option */}
          <button
            onClick={() => pick(null)}
            disabled={saving}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 rounded-2xl border border-slate-700/50"
          >
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
              <XCircle size={16} className="text-slate-400" />
            </div>
            <span className="text-slate-300 text-sm font-medium">Unassigned</span>
          </button>

          {sorted.map(tech => {
            const info = availableTechs.find(t => t.id === tech.id) || {}
            const isAvail = info.available
            const isConf  = info.confirmed
            const isCurrent = deal.assigned_to === tech.id
            return (
              <button
                key={tech.id}
                onClick={() => pick(tech.id)}
                disabled={saving}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                  isCurrent
                    ? 'bg-indigo-600/20 border-indigo-500/50'
                    : 'bg-slate-800 border-slate-700/50 active:bg-slate-700'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                  isConf ? 'bg-emerald-600 text-white'
                         : isAvail ? 'bg-indigo-600 text-white'
                         : 'bg-slate-700 text-slate-400'
                }`}>
                  {(tech.full_name || tech.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-sm font-medium ${isCurrent ? 'text-indigo-200' : 'text-slate-100'}`}>
                    {tech.full_name || tech.username}
                  </p>
                  <p className={`text-xs ${isConf ? 'text-emerald-400' : isAvail ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {isConf ? 'Confirmed for this day' : isAvail ? 'Available this day' : 'Not declared available'}
                  </p>
                </div>
                {isCurrent && <CheckCircle2 size={16} className="text-indigo-400 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Status change sheet */
function StatusSheet({ deal, onUpdate, onClose }) {
  const [saving, setSaving] = useState(false)

  async function pick(status) {
    setSaving(true)
    try {
      await onUpdate(deal.id, status)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-slate-900 rounded-t-3xl px-4 pt-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
      >
        <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
        <p className="text-white font-semibold text-base mb-1">Update Job Status</p>
        <p className="text-slate-400 text-xs mb-4">{deal.title}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {STATUS_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isCurrent = deal.job_status === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => pick(opt.value)}
                disabled={saving}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
                  isCurrent ? opt.color + ' text-white' : 'bg-slate-800 text-slate-300 active:bg-slate-700'
                }`}
              >
                <Icon size={15} />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function JobAssignment() {
  const todayMonday = weekMonday(new Date())
  const [weekStart, setWeekStart] = useState(todayMonday)
  const [deals, setDeals]         = useState([])
  const [techs, setTechs]         = useState([])
  const [availMap, setAvailMap]   = useState({}) // date → [techInfo]
  const [loading, setLoading]     = useState(true)
  const [expandedDay, setExpandedDay] = useState(null)

  const [assignSheet, setAssignSheet] = useState(null) // deal object
  const [statusSheet, setStatusSheet] = useState(null) // deal object

  const weekDates = DAY_KEYS.map((_, i) => addDays(weekStart, i))
  const weekEnd   = addDays(weekStart, 6)
  const isCurrentWeek = weekStart === todayMonday

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dealsRes, usersRes] = await Promise.all([
        api.get('/deals/', { params: { limit: 2000 } }),
        api.get('/users/'),
      ])
      const techUsers = usersRes.data.filter(u => u.role === 'technician' && u.is_active)
      setTechs(techUsers)

      // Filter deals to those with dates in any visible range (load all)
      const allDeals = dealsRes.data.filter(
        d => d.expected_close_date && d.job_status !== 'cancelled'
      )
      setDeals(allDeals)

      // Load availability for this week for all techs
      const availRes = await api.get('/availability/', { params: { week_start: weekStart } })
      // Load confirmations
      const confRes  = await api.get('/availability/confirmations')

      // Build availMap: date → [{ id, username, full_name, available, confirmed }]
      const confSet = new Set(confRes.data.map(c => `${c.user_id}:${c.shift_date}`))
      const availByUser = {}
      for (const row of availRes.data) {
        availByUser[row.user_id] = row
      }

      const map = {}
      for (let i = 0; i < 7; i++) {
        const dateStr = addDays(weekStart, i)
        const dayKey  = DAY_KEYS[i]
        map[dateStr]  = techUsers.map(t => ({
          id:        t.id,
          username:  t.username,
          full_name: t.full_name,
          available: !!(availByUser[t.id] && availByUser[t.id][dayKey]),
          confirmed: confSet.has(`${t.id}:${dateStr}`),
        }))
      }
      setAvailMap(map)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  // Auto-expand today (or first day with jobs)
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    if (weekDates.includes(today)) setExpandedDay(today)
    else setExpandedDay(weekDates[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  async function handleAssign(dealId, techId) {
    await api.put(`/deals/${dealId}`, { assigned_to: techId })
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, assigned_to: techId } : d))
  }

  async function handleStatusUpdate(dealId, status) {
    await api.put(`/deals/${dealId}`, { job_status: status })
    if (status === 'cancelled') {
      setDeals(prev => prev.filter(d => d.id !== dealId))
    } else {
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, job_status: status } : d))
    }
  }

  // Group deals by date for this week
  const dealsByDate = {}
  for (const d of deals) {
    const key = d.expected_close_date?.slice(0, 10)
    if (!key) continue
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  }

  function techName(id) {
    if (!id) return null
    const t = techs.find(t => t.id === id)
    return t ? (t.full_name || t.username) : 'Unknown'
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-0.5">
          <ClipboardList size={20} className="text-indigo-400" />
          <h1 className="text-white text-xl font-bold tracking-tight">Job Assignment</h1>
        </div>
        <p className="text-slate-500 text-xs ml-8">Assign technicians and manage job status</p>
      </div>

      {/* Week navigator */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between bg-slate-900 rounded-2xl px-4 py-3 border border-slate-700/40">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-white font-semibold text-sm">
              {isCurrentWeek ? 'This Week' : 'Week of ' + fmtShort(weekStart)}
            </p>
            <p className="text-slate-500 text-xs">{fmtShort(weekStart)} — {fmtShort(weekEnd)}</p>
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="px-4 space-y-2 pb-8">

          {/* Day summary strip */}
          <div className="grid grid-cols-7 gap-1 mb-3">
            {weekDates.map((dateStr, i) => {
              const count = (dealsByDate[dateStr] || []).length
              const today = new Date().toLocaleDateString('en-CA')
              const isToday = dateStr === today
              const isExpanded = expandedDay === dateStr
              return (
                <button
                  key={dateStr}
                  onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    isExpanded
                      ? 'bg-indigo-600 text-white'
                      : isToday
                        ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <span>{['Mo','Tu','We','Th','Fr','Sa','Su'][i]}</span>
                  {count > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isExpanded ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'
                    }`}>{count}</span>
                  )}
                  {count === 0 && <span className="text-[9px] text-slate-700">—</span>}
                </button>
              )
            })}
          </div>

          {/* Expanded day's jobs */}
          {weekDates.map((dateStr, i) => {
            if (expandedDay !== dateStr) return null
            const jobsForDay = dealsByDate[dateStr] || []
            const availTechs = availMap[dateStr] || []
            const today = new Date().toLocaleDateString('en-CA')
            const isToday = dateStr === today

            return (
              <div key={dateStr}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-semibold ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
                    {fmtFull(dateStr)}
                    {isToday && <span className="ml-2 text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                  </p>
                  <p className="text-slate-500 text-xs">{jobsForDay.length} job{jobsForDay.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Available techs for this day */}
                {availTechs.filter(t => t.available || t.confirmed).length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {availTechs.filter(t => t.available || t.confirmed).map(t => (
                      <div key={t.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        t.confirmed ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      }`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          t.confirmed ? 'bg-emerald-600' : 'bg-indigo-600'
                        }`}>
                          {(t.full_name || t.username || '?')[0].toUpperCase()}
                        </div>
                        {t.full_name?.split(' ')[0] || t.username}
                        {t.confirmed && <CheckCircle2 size={10} />}
                      </div>
                    ))}
                  </div>
                )}

                {jobsForDay.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    <ClipboardList size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No jobs scheduled for this day</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobsForDay.map(deal => {
                      const client = deal.contact
                        ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
                        : deal.title
                      const time = deal.expected_close_date?.slice(11, 16) || ''
                      const sm = statusMeta(deal.job_status)
                      const StatusIcon = sm.icon
                      const assignedTechName = techName(deal.assigned_to)
                      const assignedTechInfo = availTechs.find(t => t.id === deal.assigned_to)

                      return (
                        <div key={deal.id} className="bg-slate-900 border border-slate-700/40 rounded-2xl overflow-hidden">
                          <div className="px-4 py-3">
                            <div className="flex items-start gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-100 text-sm font-semibold truncate">{client}</p>
                                {deal.contact?.address && (
                                  <p className="text-slate-500 text-xs truncate flex items-center gap-1 mt-0.5">
                                    <MapPin size={10} /> {deal.contact.address}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {time && <span className="text-slate-400 text-xs">{time}</span>}
                                  {deal.value > 0 && (
                                    <span className="text-slate-400 text-xs flex items-center gap-0.5">
                                      <DollarSign size={10} />{deal.value.toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Status badge */}
                              <button
                                onClick={() => setStatusSheet(deal)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold flex-shrink-0 ${sm.color} text-white`}
                              >
                                <StatusIcon size={11} />
                                {sm.label}
                              </button>
                            </div>

                            {/* Assign button */}
                            <button
                              onClick={() => setAssignSheet(deal)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                                assignedTechName
                                  ? assignedTechInfo?.confirmed
                                    ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-300'
                                    : assignedTechInfo?.available
                                      ? 'bg-indigo-600/15 border-indigo-500/30 text-indigo-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-500'
                              }`}
                            >
                              <User size={13} />
                              <span className="flex-1 text-left">
                                {assignedTechName
                                  ? `Assigned: ${assignedTechName}${assignedTechInfo?.confirmed ? ' ✓' : assignedTechInfo?.available ? ' (available)' : ''}`
                                  : 'Tap to assign technician'}
                              </span>
                              <ChevronDown size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Refresh button */}
          <button
            onClick={load}
            className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 text-xs"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      )}

      {/* Assign sheet */}
      {assignSheet && (
        <AssignSheet
          deal={assignSheet}
          availableTechs={availMap[assignSheet.expected_close_date?.slice(0, 10)] || []}
          allTechs={techs}
          onAssign={handleAssign}
          onClose={() => setAssignSheet(null)}
        />
      )}

      {/* Status sheet */}
      {statusSheet && (
        <StatusSheet
          deal={statusSheet}
          onUpdate={handleStatusUpdate}
          onClose={() => setStatusSheet(null)}
        />
      )}
    </div>
  )
}
