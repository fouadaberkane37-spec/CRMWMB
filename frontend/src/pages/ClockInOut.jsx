import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Timer, Clock, Briefcase, ChevronDown, LogIn, LogOut } from 'lucide-react'

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms) {
  if (ms < 0) return '0h 0m'
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}h ${m}m`
}

function getTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ClockInOut() {
  const { user } = useAuth()
  const [entries, setEntries]         = useState([])
  const [deals, setDeals]             = useState([])
  const [selectedDeal, setSelectedDeal] = useState('')
  const [notes, setNotes]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [now, setNow]                 = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const loadEntries = useCallback(async () => {
    try {
      const res = await api.get('/timeclock/', { params: { date: getTodayISO() } })
      setEntries(res.data)
    } catch {}
  }, [])

  const loadDeals = useCallback(async () => {
    try {
      const today = getTodayISO()
      const res = await api.get('/deals/', { params: { limit: 50 } })
      const todayDeals = res.data.filter(d => {
        if (!d.expected_close_date) return false
        const dd = new Date(d.expected_close_date)
        const td = new Date(today)
        return dd.getFullYear() === td.getFullYear() && dd.getMonth() === td.getMonth() && dd.getDate() === td.getDate()
      })
      setDeals(todayDeals.length > 0 ? todayDeals : res.data.slice(0, 20))
    } catch {}
  }, [])

  useEffect(() => { loadEntries(); loadDeals() }, [loadEntries, loadDeals])

  const myEntries  = entries.filter(e => e.user_id === user?.id)
  const lastEntry  = myEntries[myEntries.length - 1]
  const isClockedIn = lastEntry?.clock_type === 'in'
  const nextAction  = isClockedIn ? 'out' : 'in'

  let totalMs = 0
  let openIn  = null
  for (const entry of myEntries) {
    if (entry.clock_type === 'in') {
      openIn = entry
    } else if (entry.clock_type === 'out' && openIn) {
      totalMs += new Date(entry.clocked_at) - new Date(openIn.clocked_at)
      openIn = null
    }
  }
  if (openIn) totalMs += now - new Date(openIn.clocked_at)

  async function handleClock() {
    setLoading(true)
    try {
      await api.post('/timeclock/', {
        clock_type: nextAction,
        deal_id: selectedDeal ? parseInt(selectedDeal) : null,
        notes: notes.trim() || null,
      })
      setNotes('')
      await loadEntries()
    } catch {}
    finally { setLoading(false) }
  }

  return (
    <div className="px-4 pt-6 pb-2 md:px-8 md:pt-8 max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Timer size={20} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Clock In / Out</h1>
          <p className="text-slate-500 text-xs">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border p-5 mb-4 ${
        isClockedIn ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-slate-900 border-slate-700/50'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Status</p>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isClockedIn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className={`text-lg font-bold ${isClockedIn ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isClockedIn ? 'Clocked In' : 'Clocked Out'}
              </span>
            </div>
            {isClockedIn && lastEntry && (
              <p className="text-slate-500 text-xs mt-1">Since {formatTime(lastEntry.clocked_at)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Today</p>
            <p className="text-3xl font-bold text-slate-100">{formatDuration(totalMs)}</p>
          </div>
        </div>
      </div>

      {/* Clock action form */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-5 mb-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Clock {nextAction === 'in' ? 'In' : 'Out'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Link to Appointment <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={selectedDeal}
                onChange={e => setSelectedDeal(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 pr-10 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ height: '48px' }}
              >
                <option value="">— No appointment —</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.title}{d.expected_close_date
                      ? ` · ${new Date(d.expected_close_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Notes <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ height: '48px' }}
            />
          </div>

          <button
            onClick={handleClock}
            disabled={loading}
            className={`w-full rounded-2xl text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              nextAction === 'in'
                ? 'bg-emerald-600 active:bg-emerald-700 text-white'
                : 'bg-red-600 active:bg-red-700 text-white'
            }`}
            style={{ height: '56px' }}
          >
            {nextAction === 'in' ? <LogIn size={20} /> : <LogOut size={20} />}
            {loading ? 'Processing…' : `CLOCK ${nextAction.toUpperCase()}`}
          </button>
        </div>
      </div>

      {/* Today's timeline */}
      {myEntries.length > 0 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Clock size={13} /> Today's Timeline
          </h2>
          <div className="space-y-1">
            {myEntries.map((entry, idx) => (
              <div key={entry.id} className="flex items-center gap-3" style={{ minHeight: '44px' }}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.clock_type === 'in' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase ${entry.clock_type === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {entry.clock_type === 'in' ? 'In' : 'Out'}
                    </span>
                    <span className="text-slate-300 text-sm font-medium">{formatTime(entry.clocked_at)}</span>
                    {entry.deal_title && <span className="text-slate-500 text-xs truncate">{entry.deal_title}</span>}
                  </div>
                </div>
                {entry.clock_type === 'out' && idx > 0 && myEntries[idx - 1]?.clock_type === 'in' && (
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {formatDuration(new Date(entry.clocked_at) - new Date(myEntries[idx - 1].clocked_at))}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
            <span className="text-slate-400 text-sm font-medium">Total today</span>
            <span className="text-slate-100 font-bold text-lg">{formatDuration(totalMs)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
