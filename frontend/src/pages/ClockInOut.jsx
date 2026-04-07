import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Timer, Clock, CheckCircle, Briefcase, ChevronDown } from 'lucide-react'

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
  const [entries, setEntries] = useState([])
  const [deals, setDeals] = useState([])
  const [selectedDeal, setSelectedDeal] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())

  // Tick clock every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const loadEntries = useCallback(async () => {
    try {
      const today = getTodayISO()
      const res = await api.get('/timeclock/', { params: { date: today } })
      setEntries(res.data)
    } catch (err) {
      console.error('Failed to load timeclock entries', err)
    }
  }, [])

  const loadDeals = useCallback(async () => {
    try {
      const today = getTodayISO()
      // Fetch deals with today's expected_close_date as appointments
      const res = await api.get('/deals/', { params: { limit: 50 } })
      // Filter to today's appointments
      const todayDeals = res.data.filter(d => {
        if (!d.expected_close_date) return false
        const dealDate = new Date(d.expected_close_date)
        const todayDate = new Date(today)
        return (
          dealDate.getFullYear() === todayDate.getFullYear() &&
          dealDate.getMonth() === todayDate.getMonth() &&
          dealDate.getDate() === todayDate.getDate()
        )
      })
      setDeals(todayDeals.length > 0 ? todayDeals : res.data.slice(0, 20))
    } catch (err) {
      console.error('Failed to load deals', err)
    }
  }, [])

  useEffect(() => {
    loadEntries()
    loadDeals()
  }, [loadEntries, loadDeals])

  // Determine last clock action for current user
  const myEntries = entries.filter(e => e.user_id === user?.id)
  const lastEntry = myEntries[myEntries.length - 1]
  const isClockedIn = lastEntry?.clock_type === 'in'
  const nextAction = isClockedIn ? 'out' : 'in'

  // Calculate total hours worked today (sum of paired in/out)
  let totalMs = 0
  const paired = []
  let openIn = null
  for (const entry of myEntries) {
    if (entry.clock_type === 'in') {
      openIn = entry
    } else if (entry.clock_type === 'out' && openIn) {
      const ms = new Date(entry.clocked_at) - new Date(openIn.clocked_at)
      totalMs += ms
      paired.push({ in: openIn, out: entry, ms })
      openIn = null
    }
  }
  // If currently clocked in, add time so far
  if (openIn) {
    const ms = now - new Date(openIn.clocked_at)
    totalMs += ms
  }

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
    } catch (err) {
      console.error('Clock action failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Timer size={20} className="text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Clock In / Out</h1>
          </div>
          <p className="text-slate-500 text-sm ml-13">
            {new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Status card */}
        <div className={`rounded-2xl border p-6 mb-6 ${
          isClockedIn
            ? 'bg-emerald-900/20 border-emerald-700/40'
            : 'bg-slate-900 border-slate-700/50'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isClockedIn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className={`text-lg font-semibold ${isClockedIn ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {isClockedIn ? 'Clocked In' : 'Clocked Out'}
                </span>
              </div>
              {isClockedIn && lastEntry && (
                <p className="text-slate-500 text-sm mt-1">Since {formatTime(lastEntry.clocked_at)}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Today</p>
              <p className="text-2xl font-bold text-slate-100">{formatDuration(totalMs)}</p>
            </div>
          </div>
        </div>

        {/* Clock action */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
            Clock {nextAction === 'in' ? 'In' : 'Out'}
          </h2>

          <div className="space-y-4">
            {/* Appointment selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                <Briefcase size={14} className="inline mr-1.5 text-slate-400" />
                Link to Appointment (optional)
              </label>
              <div className="relative">
                <select
                  value={selectedDeal}
                  onChange={e => setSelectedDeal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2.5 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— No appointment —</option>
                  {deals.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.title}{d.expected_close_date ? ` · ${new Date(d.expected_close_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add a note..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Big button */}
            <button
              onClick={handleClock}
              disabled={loading}
              className={`w-full py-4 rounded-xl text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                nextAction === 'in'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              <Timer size={20} />
              {loading ? 'Processing…' : `CLOCK ${nextAction.toUpperCase()}`}
            </button>
          </div>
        </div>

        {/* Today's timeline */}
        {myEntries.length > 0 && (
          <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Clock size={14} />
              Today's Timeline
            </h2>
            <div className="space-y-2">
              {myEntries.map((entry, idx) => (
                <div key={entry.id} className="flex items-center gap-3 py-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    entry.clock_type === 'in' ? 'bg-emerald-400' : 'bg-red-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase ${
                        entry.clock_type === 'in' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {entry.clock_type === 'in' ? 'Clock In' : 'Clock Out'}
                      </span>
                      <span className="text-slate-300 text-sm font-medium">{formatTime(entry.clocked_at)}</span>
                    </div>
                    {entry.deal_title && (
                      <p className="text-slate-500 text-xs truncate">{entry.deal_title}</p>
                    )}
                    {entry.notes && (
                      <p className="text-slate-500 text-xs italic">{entry.notes}</p>
                    )}
                  </div>
                  {/* Duration for out entries */}
                  {entry.clock_type === 'out' && idx > 0 && myEntries[idx - 1]?.clock_type === 'in' && (
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {formatDuration(new Date(entry.clocked_at) - new Date(myEntries[idx - 1].clocked_at))}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
              <span className="text-slate-400 text-sm">Total hours today</span>
              <span className="text-slate-100 font-semibold">{formatDuration(totalMs)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
