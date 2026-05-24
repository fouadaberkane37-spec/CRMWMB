import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import {
  ChevronLeft, ChevronRight, Send, X, Share2,
  Clock, MapPin, Wrench, Users, Check, CalendarDays,
} from 'lucide-react'

const API = '/api'

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const DAY_LONG  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MON_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
const MON_LONG  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const SERVICE_LABELS = {
  'gutters':     'Gouttières',
  'window-ext':  'Vitres Ext.',
  'window-int':  'Vitres Int.',
  'window-full': 'Vitres Int.+Ext.',
  'pressure':    'Haute pression',
  'roof':        'Toiture',
  'screens':     'Moustiquaires',
  'solar':       'Panneaux solaires',
  'estimate':    'Estimation',
  'follow_up':   'Suivi',
  'service':     'Service général',
  'install':     'Installation',
}

const AVATAR_COLORS = [
  'bg-emerald-600', 'bg-blue-600', 'bg-purple-600',
  'bg-orange-500',  'bg-teal-600', 'bg-rose-600',
]

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function startOfWeek(d) {
  const c = new Date(d)
  c.setDate(c.getDate() - c.getDay())
  c.setHours(0, 0, 0, 0)
  return c
}
function addDays(d, n) {
  const c = new Date(d); c.setDate(c.getDate() + n); return c
}
function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function avatarColor(id) { return AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length] }
function initials(name) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}


// ── Format schedule as plain text for sharing ─────────────────────────────────
function buildScheduleText(techName, bookings, weekStart) {
  const weekEnd = addDays(weekStart, 6)
  const s = `${weekStart.getDate()} ${MON_SHORT[weekStart.getMonth()]}`
  const e = `${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]}`

  let txt = `📅 Programme de ${techName}\n${s} — ${e}\n\n`

  const byDay = {}
  bookings.forEach(b => {
    if (!b.scheduled_at) return
    const d = toYMD(new Date(b.scheduled_at))
    ;(byDay[d] = byDay[d] || []).push(b)
  })

  const days = Object.keys(byDay).sort()
  if (!days.length) { txt += 'Aucun rendez-vous cette semaine.'; return txt }

  days.forEach(dk => {
    const d = new Date(dk + 'T12:00:00')
    txt += `📆 ${DAY_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}\n`
    byDay[dk]
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .forEach(b => {
        const who   = b.contact ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim() : (b.title || '')
        const svc   = SERVICE_LABELS[b.type] || b.type || ''
        const addr  = b.address ? ` — ${b.address}` : ''
        const dur   = b.duration_minutes ? ` (${b.duration_minutes} min)` : ''
        txt += `  • ${fmtTime(b.scheduled_at)}${dur} — ${who}, ${svc}${addr}\n`
      })
    txt += '\n'
  })

  return txt.trim()
}


// ── Send Sheet ────────────────────────────────────────────────────────────────
function SendSheet({ bookings, techs, weekStart, onClose }) {
  const [copied, setCopied] = useState({})

  const weekEnd   = addDays(weekStart, 6)
  const rangeStr  = `${weekStart.getDate()} ${MON_SHORT[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]}`

  // Group bookings by technician_id
  const byTech = {}
  bookings.forEach(b => {
    const key = b.technician_id ?? 'none'
    ;(byTech[key] = byTech[key] || []).push(b)
  })

  const assignedTechs = techs.filter(t => byTech[t.id])
  const unassignedCount = (byTech['none'] || []).length

  async function share(techId, techName) {
    const bkgs = byTech[techId] || []
    const text  = buildScheduleText(techName, bkgs, weekStart)
    if (navigator.share) {
      try { await navigator.share({ title: `Programme ${techName}`, text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(p => ({ ...p, [techId]: true }))
      setTimeout(() => setCopied(p => ({ ...p, [techId]: false })), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-slate-900 rounded-t-3xl w-full max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        {/* Handle */}
        <div className="pt-3 flex justify-center">
          <div className="w-10 h-1 bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-slate-800 flex items-start justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Envoyer le programme</h2>
            <p className="text-slate-400 text-sm mt-0.5">{rangeStr}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mt-0.5 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tech list */}
        <div className="px-5 py-4 space-y-3">
          {assignedTechs.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-10">
              Aucun technicien assigné cette semaine.
            </p>
          )}

          {assignedTechs.map(tech => {
            const name  = tech.full_name || tech.username
            const bkgs  = byTech[tech.id] || []
            const isCopied = copied[tech.id]

            return (
              <div key={tech.id} className="bg-slate-800 rounded-2xl p-4">
                {/* Tech header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${avatarColor(tech.id)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {initials(name)}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{name}</p>
                      <p className="text-slate-400 text-xs">{bkgs.length} rendez-vous</p>
                    </div>
                  </div>
                  <button
                    onClick={() => share(tech.id, name)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
                      isCopied
                        ? 'bg-green-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {isCopied ? <Check size={14} /> : <Share2 size={14} />}
                    {isCopied ? 'Copié !' : 'Partager'}
                  </button>
                </div>

                {/* Preview — first 4 bookings */}
                <div className="space-y-1.5 border-t border-slate-700/60 pt-3">
                  {bkgs
                    .slice()
                    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
                    .slice(0, 4)
                    .map(b => {
                      const d       = new Date(b.scheduled_at)
                      const contact = b.contact
                        ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim()
                        : b.title
                      return (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 font-semibold w-20 shrink-0">
                            {DAY_SHORT[d.getDay()]} {fmtTime(b.scheduled_at)}
                          </span>
                          <span className="text-slate-300 truncate">{contact}</span>
                          <span className="text-slate-600 shrink-0 truncate hidden sm:block">
                            {SERVICE_LABELS[b.type] || b.type}
                          </span>
                        </div>
                      )
                    })}
                  {bkgs.length > 4 && (
                    <p className="text-slate-600 text-xs pt-0.5">+{bkgs.length - 4} autres…</p>
                  )}
                </div>
              </div>
            )
          })}

          {/* Unassigned note */}
          {unassignedCount > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Users size={15} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                {unassignedCount} rendez-vous sans technicien assigné
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function WeekSchedule() {
  const { token } = useAuth()
  const [weekStart,   setWeekStart]   = useState(() => startOfWeek(new Date()))
  const [bookings,    setBookings]    = useState([])
  const [techs,       setTechs]       = useState([])
  const [loading,     setLoading]     = useState(false)
  const [filterTech,  setFilterTech]  = useState(null)
  const [showSend,    setShowSend]    = useState(false)

  const headers = { Authorization: `Bearer ${token}` }

  // Load technicians once
  useEffect(() => {
    fetch(`${API}/users/`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => setTechs(
        (Array.isArray(data) ? data : []).filter(u => u.role === 'technician' || u.role === 'admin')
      ))
      .catch(() => {})
  }, [])

  // Load bookings for the week whenever weekStart changes
  useEffect(() => {
    async function load() {
      setLoading(true)
      const from  = weekStart.toISOString()
      const toDay = addDays(weekStart, 6)
      toDay.setHours(23, 59, 59, 999)
      const to    = toDay.toISOString()
      try {
        const res  = await fetch(`${API}/bookings/?from_date=${from}&to_date=${to}&limit=500`, { headers })
        const data = await res.json()
        setBookings(Array.isArray(data) ? data : [])
      } catch {
        setBookings([])
      }
      setLoading(false)
    }
    load()
  }, [weekStart])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today    = new Date(); today.setHours(0, 0, 0, 0)

  // Count per day (all bookings, ignoring filter)
  const dayCount = {}
  bookings.forEach(b => {
    if (!b.scheduled_at) return
    const d = toYMD(new Date(b.scheduled_at))
    dayCount[d] = (dayCount[d] || 0) + 1
  })

  // Apply tech filter
  const filtered = filterTech !== null
    ? bookings.filter(b => b.technician_id === filterTech)
    : bookings

  // Group filtered bookings by day
  const grouped = {}
  filtered.forEach(b => {
    if (!b.scheduled_at) return
    const d = toYMD(new Date(b.scheduled_at))
    ;(grouped[d] = grouped[d] || []).push(b)
  })

  // Techs that have at least one booking this week
  const activeTechs = techs.filter(t => bookings.some(b => b.technician_id === t.id))

  const weekEnd    = addDays(weekStart, 6)
  const rangeLabel = `${weekStart.getDate()} ${MON_SHORT[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]}`

  return (
    <div className="flex flex-col h-full bg-slate-950">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-bold text-xl">Horaire</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(w => addDays(w, -7))}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-slate-300 text-sm font-medium w-32 text-center">{rangeLabel}</span>
            <button
              onClick={() => setWeekStart(w => addDays(w, 7))}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* 7-day strip */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {weekDays.map(d => {
            const ds      = toYMD(d)
            const isToday = ds === toYMD(today)
            const count   = dayCount[ds] || 0
            return (
              <div
                key={ds}
                className={`flex flex-col items-center py-2 rounded-xl ${isToday ? 'bg-indigo-600/20' : ''}`}
              >
                <span className={`text-[10px] font-semibold ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                  {DAY_SHORT[d.getDay()]}
                </span>
                <span className={`text-sm font-bold mt-0.5 ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
                  {d.getDate()}
                </span>
                {count > 0 ? (
                  <span className="mt-1 text-[9px] font-bold text-white bg-indigo-600 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {count}
                  </span>
                ) : (
                  <span className="mt-1 w-4 h-4" />
                )}
              </div>
            )
          })}
        </div>

        {/* Tech filter chips */}
        {activeTechs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setFilterTech(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filterTech === null ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Tous ({bookings.length})
            </button>
            {activeTechs.map(t => {
              const name  = t.full_name || t.username
              const count = bookings.filter(b => b.technician_id === t.id).length
              const isSelected = filterTech === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setFilterTech(isSelected ? null : t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    isSelected
                      ? `${avatarColor(t.id)} text-white`
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold">{initials(name)}</span>
                  {name.split(' ')[0]}
                  <span className="opacity-70">({count})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Booking list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-slate-400 text-center py-20">Chargement…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-base">Aucun rendez-vous cette semaine</p>
            {filterTech !== null && (
              <button
                onClick={() => setFilterTech(null)}
                className="mt-3 text-indigo-400 text-sm underline"
              >
                Voir tous les techniciens
              </button>
            )}
          </div>
        ) : (
          weekDays.map(d => {
            const ds          = toYMD(d)
            const dayBookings = (grouped[ds] || [])
              .slice()
              .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
            if (!dayBookings.length) return null
            const isToday = ds === toYMD(today)

            return (
              <div key={ds} className="mb-6">
                {/* Day label */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-bold ${isToday ? 'text-indigo-400' : 'text-slate-300'}`}>
                    {DAY_LONG[d.getDay()]} {d.getDate()} {MON_SHORT[d.getMonth()]}
                  </span>
                  {isToday && (
                    <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold">
                      Aujourd'hui
                    </span>
                  )}
                  <span className="text-slate-600 text-xs">{dayBookings.length} RDV</span>
                </div>

                {/* Booking cards */}
                <div className="space-y-2">
                  {dayBookings.map(b => {
                    const contact  = b.contact
                      ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim()
                      : (b.title || '—')
                    const svcLabel = SERVICE_LABELS[b.type] || (b.type || 'service').replace('_', ' ')
                    const tech     = b.technician
                    const techName = tech ? (tech.full_name || tech.username) : null
                    const techId   = b.technician_id

                    const statusColors = {
                      todo:            'border-l-indigo-500',
                      payment_pending: 'border-l-amber-500',
                      done:            'border-l-green-500',
                      cancelled:       'border-l-slate-600',
                    }
                    const borderCls = statusColors[b.status] || 'border-l-indigo-500'

                    return (
                      <div
                        key={b.id}
                        className={`bg-slate-900 rounded-r-2xl rounded-l-sm border-l-4 ${borderCls} border border-slate-800 px-4 py-3`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Time column */}
                          <div className="text-center shrink-0 w-14">
                            <p className="text-white font-bold text-sm leading-tight">
                              {fmtTime(b.scheduled_at)}
                            </p>
                            {b.duration_minutes && (
                              <p className="text-slate-600 text-[10px] mt-0.5 flex items-center justify-center gap-0.5">
                                <Clock size={9} />{b.duration_minutes}m
                              </p>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm leading-tight">{contact}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-slate-400 text-xs flex items-center gap-0.5">
                                <Wrench size={10} />{svcLabel}
                              </span>
                              {b.address && (
                                <span className="text-slate-500 text-xs flex items-center gap-0.5 truncate max-w-[140px]">
                                  <MapPin size={10} className="shrink-0" />{b.address}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Tech avatar */}
                          {techName ? (
                            <div
                              className={`w-9 h-9 rounded-full ${avatarColor(techId)} flex items-center justify-center text-white font-bold text-xs shrink-0`}
                              title={techName}
                            >
                              {initials(techName)}
                            </div>
                          ) : (
                            <div
                              className="w-9 h-9 rounded-full bg-slate-800 border border-dashed border-slate-600 flex items-center justify-center shrink-0"
                              title="Aucun technicien"
                            >
                              <Users size={14} className="text-slate-500" />
                            </div>
                          )}
                        </div>

                        {/* Phone quick-dial if contact has phone */}
                        {b.contact?.phone && (
                          <a
                            href={`tel:${b.contact.phone}`}
                            className="mt-2 ml-[68px] inline-flex items-center gap-1 text-indigo-400 text-xs hover:text-indigo-300"
                            onClick={e => e.stopPropagation()}
                          >
                            📞 {b.contact.phone}
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Send button ── */}
      <div
        className="px-4 pt-3 border-t border-slate-800"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <button
          onClick={() => setShowSend(true)}
          disabled={bookings.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-2xl text-base font-semibold transition-colors"
        >
          <Send size={18} />
          Envoyer le programme aux techniciens
        </button>
      </div>

      {/* ── Send sheet ── */}
      {showSend && (
        <SendSheet
          bookings={bookings}
          techs={techs}
          weekStart={weekStart}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  )
}
