import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import {
  ClipboardList, ChevronLeft, ChevronRight, Loader2,
  Users, CheckCircle2, Circle, AlertCircle, XCircle, RefreshCw,
  MapPin, DollarSign, Clock, Bell, BellOff, AlertTriangle,
} from 'lucide-react'

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

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
function initials(t) {
  return (t?.full_name || t?.username || '?')[0].toUpperCase()
}

const STATUS_OPTIONS = [
  { value: 'todo',            label: 'Scheduled', color: 'bg-indigo-600',  icon: Circle },
  { value: 'payment_pending', label: 'Pending $', color: 'bg-amber-500',   icon: AlertCircle },
  { value: 'done',            label: 'Done',      color: 'bg-emerald-600', icon: CheckCircle2 },
  { value: 'cancelled',       label: 'Cancelled', color: 'bg-red-600',     icon: XCircle },
]
function statusMeta(s) { return STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0] }

/* ── Multi-select Assign Sheet ── */
function AssignSheet({ deal, availTechs, allTechs, onToggle, onClose }) {
  const [pending, setPending] = useState(null) // techId being toggled

  const assignedIds = new Set((deal.assigned_techs || []).map(t => t.id))

  const sorted = [...allTechs].sort((a, b) => {
    const score = t => availTechs.find(x => x.id === t.id)?.confirmed ? 2
                     : availTechs.find(x => x.id === t.id)?.available ? 1 : 0
    return score(b) - score(a)
  })

  async function toggle(techId) {
    setPending(techId)
    try { await onToggle(deal.id, techId) }
    finally { setPending(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-t-3xl px-4 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)', maxHeight: '82vh', overflowY: 'auto' }}>
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-1">
          <p className="text-white font-semibold text-base">Assign Technicians</p>
          <button onClick={onClose} className="text-xs text-indigo-400 font-semibold px-3 py-1 bg-indigo-900/30 rounded-xl">Done</button>
        </div>
        <p className="text-slate-500 text-xs mb-4">
          {deal.contact ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim() : deal.title}
          {' · '}{assignedIds.size} assigned
        </p>

        <div className="space-y-2">
          {sorted.map(tech => {
            const info     = availTechs.find(t => t.id === tech.id) || {}
            const isConf   = info.confirmed
            const isAvail  = info.available
            const isOn     = assignedIds.has(tech.id)
            const spinning = pending === tech.id

            return (
              <button
                key={tech.id}
                onClick={() => toggle(tech.id)}
                disabled={!!pending}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                  isOn
                    ? isConf  ? 'bg-emerald-600/20 border-emerald-500/40'
                    : isAvail ? 'bg-indigo-600/20 border-indigo-500/40'
                    :           'bg-slate-700/60 border-slate-600/50'
                    : 'bg-slate-800 border-slate-700/40 active:bg-slate-700'
                }`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  isConf  ? 'bg-emerald-600 text-white'
                  : isAvail ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300'
                }`}>
                  {initials(tech)}
                </div>

                {/* Info */}
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-sm font-semibold ${isOn ? 'text-white' : 'text-slate-200'}`}>
                    {tech.full_name || tech.username}
                  </p>
                  <p className={`text-xs ${isConf ? 'text-emerald-400' : isAvail ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {isConf ? '✓ Confirmed for this day' : isAvail ? 'Available this day' : 'Not declared available'}
                  </p>
                </div>

                {/* Toggle indicator */}
                {spinning
                  ? <Loader2 size={18} className="animate-spin text-slate-400 flex-shrink-0" />
                  : isOn
                    ? <CheckCircle2 size={20} className={`flex-shrink-0 ${isConf ? 'text-emerald-400' : 'text-indigo-400'}`} />
                    : <Circle size={20} className="flex-shrink-0 text-slate-700" />
                }
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Status Sheet ── */
function StatusSheet({ deal, onUpdate, onClose }) {
  const [saving, setSaving] = useState(false)
  async function pick(status) {
    setSaving(true)
    try { await onUpdate(deal.id, status); onClose() }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-t-3xl px-4 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
        <p className="text-white font-semibold text-base mb-1">Update Status</p>
        <p className="text-slate-500 text-xs mb-4">
          {deal.contact ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim() : deal.title}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {STATUS_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isCurrent = deal.job_status === opt.value
            return (
              <button key={opt.value} onClick={() => pick(opt.value)} disabled={saving}
                className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
                  isCurrent ? opt.color + ' text-white shadow-lg' : 'bg-slate-800 text-slate-300 active:bg-slate-700'
                }`}>
                <Icon size={15} />{opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export default function JobAssignment() {
  const todayMonday = weekMonday(new Date())
  const [weekStart, setWeekStart]     = useState(todayMonday)
  const [deals, setDeals]             = useState([])
  const [techs, setTechs]             = useState([])
  const [availMap, setAvailMap]       = useState({})
  const [loading, setLoading]         = useState(true)
  const [expandedDay, setExpandedDay] = useState(null)
  const [assignSheet, setAssignSheet] = useState(null)
  const [statusSheet, setStatusSheet] = useState(null)
  const [techPhones, setTechPhones]   = useState({}) // userId → bool (has phone)

  const weekDates     = DAY_KEYS.map((_, i) => addDays(weekStart, i))
  const weekEnd       = addDays(weekStart, 6)
  const isCurrentWeek = weekStart === todayMonday

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dealsRes, usersRes, availRes, confRes] = await Promise.all([
        api.get('/deals/', { params: { limit: 2000 } }),
        api.get('/users/'),
        api.get('/availability/', { params: { week_start: weekStart } }),
        api.get('/availability/confirmations'),
      ])
      const techUsers = usersRes.data.filter(u => u.role === 'technician' && u.is_active)
      setTechs(techUsers)
      const phones = {}
      techUsers.forEach(t => { phones[t.id] = !!(t.phone) })
      setTechPhones(phones)
      setDeals(dealsRes.data.filter(d => d.expected_close_date && d.job_status !== 'cancelled'))

      const confSet    = new Set(confRes.data.map(c => `${c.user_id}:${c.shift_date}`))
      const availByUser = {}
      for (const row of availRes.data) availByUser[row.user_id] = row

      const map = {}
      for (let i = 0; i < 7; i++) {
        const dateStr = addDays(weekStart, i)
        const dayKey  = DAY_KEYS[i]
        map[dateStr]  = techUsers.map(t => ({
          id:        t.id,
          username:  t.username,
          full_name: t.full_name,
          available: !!(availByUser[t.id]?.[dayKey]),
          confirmed: confSet.has(`${t.id}:${dateStr}`),
        }))
      }
      setAvailMap(map)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    setExpandedDay(weekDates.includes(today) ? today : weekDates[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  async function handleToggle(dealId, techId) {
    await api.post(`/deals/${dealId}/techs/${techId}`)
    // Refresh just the assigned_techs for this deal
    const res = await api.get(`/deals/${dealId}`)
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, assigned_techs: res.data.assigned_techs } : d))
    // Keep sheet open with updated deal
    setAssignSheet(prev => prev?.id === dealId ? { ...prev, assigned_techs: res.data.assigned_techs } : prev)
  }

  async function handleStatusUpdate(dealId, status) {
    await api.put(`/deals/${dealId}`, { job_status: status })
    if (status === 'cancelled') setDeals(prev => prev.filter(d => d.id !== dealId))
    else setDeals(prev => prev.map(d => d.id === dealId ? { ...d, job_status: status } : d))
  }

  const dealsByDate = {}
  for (const d of deals) {
    const key = d.expected_close_date?.slice(0, 10)
    if (!key) continue
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-2.5 mb-0.5">
          <ClipboardList size={20} className="text-indigo-400" />
          <h1 className="text-white text-xl font-bold tracking-tight">Job Assignment</h1>
        </div>
        <p className="text-slate-500 text-xs ml-8">Assign technicians · manage status</p>
      </div>

      {/* Week navigator */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between bg-slate-900 rounded-2xl px-4 py-3 border border-slate-800">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-white font-semibold text-sm">
              {isCurrentWeek ? 'This Week' : 'Week of ' + fmtShort(weekStart)}
            </p>
            <p className="text-slate-500 text-xs">{fmtShort(weekStart)} — {fmtShort(weekEnd)}</p>
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="px-4 pb-10">

          {/* Day strip */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDates.map((dateStr, i) => {
              const count      = (dealsByDate[dateStr] || []).length
              const today      = new Date().toLocaleDateString('en-CA')
              const isToday    = dateStr === today
              const isExpanded = expandedDay === dateStr
              return (
                <button key={dateStr}
                  onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-2xl text-xs font-semibold transition-all ${
                    isExpanded ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                    : isToday  ? 'bg-slate-800 text-indigo-300 border border-indigo-500/30'
                    :            'bg-slate-900 text-slate-500 border border-slate-800'
                  }`}>
                  <span>{['Mo','Tu','We','Th','Fr','Sa','Su'][i]}</span>
                  {count > 0
                    ? <span className={`text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                        isExpanded ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                      }`}>{count}</span>
                    : <span className="text-[9px] opacity-30">·</span>
                  }
                </button>
              )
            })}
          </div>

          {/* Expanded day */}
          {weekDates.map((dateStr, i) => {
            if (expandedDay !== dateStr) return null
            const jobs      = dealsByDate[dateStr] || []
            const availTechs = availMap[dateStr] || []
            const today     = new Date().toLocaleDateString('en-CA')
            const isToday   = dateStr === today

            return (
              <div key={dateStr}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-white'}`}>
                      {fmtFull(dateStr)}
                    </p>
                    {isToday && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold">Today</span>}
                  </div>
                  <p className="text-slate-500 text-xs">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Available techs pills */}
                {availTechs.some(t => t.available || t.confirmed) && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {availTechs.filter(t => t.available || t.confirmed).map(t => (
                      <div key={t.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        t.confirmed ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
                                    : 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40'
                      }`}>
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold ${
                          t.confirmed ? 'bg-emerald-600' : 'bg-indigo-600'
                        }`}>{initials(t)}</div>
                        {t.full_name?.split(' ')[0] || t.username}
                        {t.confirmed && ' ✓'}
                      </div>
                    ))}
                  </div>
                )}

                {jobs.length === 0 ? (
                  <div className="text-center py-12 text-slate-700">
                    <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No jobs this day</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobs.map(deal => {
                      const client    = deal.contact
                        ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
                        : deal.title
                      const time      = deal.expected_close_date?.slice(11, 16) || ''
                      const sm        = statusMeta(deal.job_status)
                      const StatusIcon = sm.icon
                      const assigned  = deal.assigned_techs || []

                      return (
                        <div key={deal.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                          {/* Job info row */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex items-start gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold truncate">{client}</p>
                                {deal.contact?.address && (
                                  <p className="text-slate-500 text-xs truncate flex items-center gap-1 mt-0.5">
                                    <MapPin size={9} />{deal.contact.address}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1">
                                  {time && <span className="text-slate-400 text-xs flex items-center gap-1"><Clock size={9}/>{time}</span>}
                                  {deal.value > 0 && <span className="text-slate-400 text-xs flex items-center gap-0.5"><DollarSign size={9}/>{deal.value.toFixed(0)}</span>}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <button onClick={() => setStatusSheet(deal)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${sm.color} text-white`}>
                                  <StatusIcon size={11} />{sm.label}
                                </button>
                                {deal.reminder_sent
                                  ? <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium px-2"><Bell size={9} />Rappel ✓</span>
                                  : <span className="flex items-center gap-1 text-[10px] text-slate-600 px-2"><BellOff size={9} />En attente</span>
                                }
                              </div>
                            </div>

                            {/* Missing phone warning */}
                            {assigned.length > 0 && assigned.some(t => !techPhones[t.id]) && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 mb-1 bg-amber-900/20 border border-amber-700/30 rounded-xl">
                                <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
                                <p className="text-amber-400 text-xs">
                                  {assigned.filter(t => !techPhones[t.id]).map(t => t.full_name?.split(' ')[0] || t.username).join(', ')} — pas de numéro de téléphone
                                </p>
                              </div>
                            )}

                            {/* Assigned techs row */}
                            <button onClick={() => setAssignSheet(deal)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700/50 active:bg-slate-700 transition-colors">
                              <Users size={13} className="text-slate-500 flex-shrink-0" />
                              {assigned.length === 0 ? (
                                <span className="text-slate-500 text-xs flex-1 text-left">Tap to assign technicians</span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                                  {assigned.map(t => {
                                    const info = availTechs.find(x => x.id === t.id) || {}
                                    return (
                                      <span key={t.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                        info.confirmed ? 'bg-emerald-600/25 text-emerald-300'
                                        : info.available ? 'bg-indigo-600/25 text-indigo-300'
                                        : 'bg-slate-700 text-slate-300'
                                      }`}>
                                        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold ${
                                          info.confirmed ? 'bg-emerald-600' : info.available ? 'bg-indigo-600' : 'bg-slate-600'
                                        }`}>{initials(t)}</span>
                                        {t.full_name?.split(' ')[0] || t.username}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                              <span className="text-slate-600 text-xs flex-shrink-0">Edit</span>
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

          <button onClick={load} className="w-full flex items-center justify-center gap-2 py-4 text-slate-600 text-xs mt-2">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      )}

      {assignSheet && (
        <AssignSheet
          deal={assignSheet}
          availTechs={availMap[assignSheet.expected_close_date?.slice(0, 10)] || []}
          allTechs={techs}
          onToggle={handleToggle}
          onClose={() => setAssignSheet(null)}
        />
      )}

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
