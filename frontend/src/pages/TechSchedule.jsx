import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { CalendarDays, CheckCircle2, Circle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'

const DAY_KEYS  = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_FULL   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Return YYYY-MM-DD for the Monday of the week containing `date` */
function weekMonday(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  return d.toLocaleDateString('en-CA')
}

/** Add `n` days to a YYYY-MM-DD string */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

/** Format YYYY-MM-DD as "Apr 14" */
function fmtShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export default function TechSchedule() {
  const todayMonday = weekMonday(new Date())
  const [weekStart, setWeekStart] = useState(todayMonday)
  const [days, setDays]           = useState({ mon:false, tue:false, wed:false, thu:false, fri:false, sat:false, sun:false })
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [confirmations, setConfirmations] = useState({}) // date → bool
  const [confirming, setConfirming]       = useState(null)
  const [myDeals, setMyDeals]             = useState([])
  const [loading, setLoading]             = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [availRes, confRes, dealsRes] = await Promise.all([
        api.get('/availability/', { params: { week_start: weekStart } }),
        api.get('/availability/confirmations'),
        api.get('/deals/', { params: { limit: 1000 } }),
      ])
      // Availability for this week
      const myAvail = availRes.data.find(a => a.week_start === weekStart)
      if (myAvail) {
        setDays({ mon: myAvail.mon, tue: myAvail.tue, wed: myAvail.wed,
                  thu: myAvail.thu, fri: myAvail.fri, sat: myAvail.sat, sun: myAvail.sun })
      } else {
        setDays({ mon:false, tue:false, wed:false, thu:false, fri:false, sat:false, sun:false })
      }
      // Confirmations: build a date→bool map
      const confMap = {}
      for (const c of confRes.data) confMap[c.shift_date] = true
      setConfirmations(confMap)
      // Deals assigned to me
      setMyDeals(dealsRes.data.filter(d => d.expected_close_date && d.job_status !== 'cancelled'))
    } catch {}
    finally { setLoading(false) }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  async function submitAvailability() {
    setSaving(true)
    try {
      await api.post('/availability/', { week_start: weekStart, ...days })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  async function toggleConfirm(dateStr) {
    setConfirming(dateStr)
    try {
      if (confirmations[dateStr]) {
        await api.delete(`/availability/confirm/${dateStr}`)
        setConfirmations(prev => { const n = { ...prev }; delete n[dateStr]; return n })
      } else {
        await api.post('/availability/confirm', { shift_date: dateStr })
        setConfirmations(prev => ({ ...prev, [dateStr]: true }))
      }
    } finally { setConfirming(null) }
  }

  function prevWeek() { setWeekStart(addDays(weekStart, -7)) }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)) }

  const isCurrentWeek = weekStart === todayMonday

  // Build the 7 dates for this week
  const weekDates = DAY_KEYS.map((_, i) => addDays(weekStart, i))

  // Group deals by date for quick lookup
  const dealsByDate = {}
  for (const d of myDeals) {
    const key = d.expected_close_date.slice(0, 10)
    if (!dealsByDate[key]) dealsByDate[key] = []
    dealsByDate[key].push(d)
  }

  const weekEnd = addDays(weekStart, 6)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-0.5">
          <CalendarDays size={20} className="text-indigo-400" />
          <h1 className="text-white text-xl font-bold tracking-tight">My Schedule</h1>
        </div>
        <p className="text-slate-500 text-xs ml-8">Set your availability & confirm shifts</p>
      </div>

      {/* Week navigator */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between bg-slate-900 rounded-2xl px-4 py-3 border border-slate-700/40">
          <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-white font-semibold text-sm">
              {isCurrentWeek ? 'This Week' : 'Week of ' + fmtShort(weekStart)}
            </p>
            <p className="text-slate-500 text-xs">{fmtShort(weekStart)} — {fmtShort(weekEnd)}</p>
          </div>
          <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="px-4 space-y-4 pb-8">

          {/* Day toggles */}
          <div className="bg-slate-900 border border-slate-700/40 rounded-2xl p-4">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">
              Days I'm Available
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_KEYS.map((key, i) => {
                const dateStr = weekDates[i]
                const today = new Date().toLocaleDateString('en-CA')
                const isPast = dateStr < today
                return (
                  <button
                    key={key}
                    onClick={() => !isPast && setDays(d => ({ ...d, [key]: !d[key] }))}
                    disabled={isPast}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                      days[key]
                        ? 'bg-indigo-600 text-white'
                        : isPast
                          ? 'bg-slate-800/40 text-slate-700'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <span>{DAY_LABELS[i]}</span>
                    <span className={`text-[9px] font-normal ${days[key] ? 'text-indigo-200' : isPast ? 'text-slate-700' : 'text-slate-600'}`}>
                      {isPast ? 'Past' : fmtShort(dateStr).split(' ')[1]}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={submitAvailability}
              disabled={saving}
              className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <Loader2 size={15} className="animate-spin" />
                : saved
                  ? <CheckCircle2 size={15} />
                  : <CalendarDays size={15} />
              }
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Submit Availability'}
            </button>
          </div>

          {/* Daily schedule with confirm buttons */}
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Week Schedule
            </p>
            <div className="space-y-2">
              {DAY_KEYS.map((key, i) => {
                const dateStr  = weekDates[i]
                const isAvail  = days[key]
                const isConf   = !!confirmations[dateStr]
                const jobs     = dealsByDate[dateStr] || []
                const today    = new Date().toLocaleDateString('en-CA')
                const isToday  = dateStr === today

                if (!isAvail) return null  // only show available days

                return (
                  <div key={key} className={`bg-slate-900 border rounded-2xl overflow-hidden ${
                    isToday ? 'border-indigo-500/40' : 'border-slate-700/40'
                  }`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${isToday ? 'text-indigo-300' : 'text-white'}`}>
                            {DAY_FULL[i]}
                            {isToday && <span className="ml-2 text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-semibold">Today</span>}
                          </p>
                        </div>
                        <p className="text-slate-500 text-xs">{fmtShort(dateStr)} · {jobs.length} job{jobs.length !== 1 ? 's' : ''} assigned</p>
                      </div>
                      <button
                        onClick={() => toggleConfirm(dateStr)}
                        disabled={confirming === dateStr}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          isConf
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {confirming === dateStr
                          ? <Loader2 size={13} className="animate-spin" />
                          : isConf
                            ? <CheckCircle2 size={13} />
                            : <Circle size={13} />
                        }
                        {isConf ? 'Confirmed' : 'Confirm'}
                      </button>
                    </div>

                    {/* Jobs for this day */}
                    {jobs.length > 0 && (
                      <div className="border-t border-slate-800">
                        {jobs.map(deal => {
                          const client = deal.contact
                            ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
                            : deal.title
                          const time = deal.expected_close_date.slice(11, 16) || ''
                          return (
                            <div key={deal.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/60 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-100 text-sm truncate">{client}</p>
                                {deal.contact?.address && (
                                  <p className="text-slate-500 text-xs truncate">{deal.contact.address}</p>
                                )}
                              </div>
                              {time && <span className="text-slate-400 text-xs flex-shrink-0">{time}</span>}
                              {deal.value > 0 && <span className="text-slate-400 text-xs flex-shrink-0">${deal.value.toFixed(0)}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* If no available days selected yet */}
              {DAY_KEYS.every((k) => !days[k]) && (
                <div className="text-center py-8 text-slate-600">
                  <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Toggle the days above and submit to set your availability</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
