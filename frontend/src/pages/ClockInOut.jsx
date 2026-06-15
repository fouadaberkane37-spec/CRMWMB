import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Timer, CheckCircle, Clock, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'

function getTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
}

function prevDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

export default function ClockInOut() {
  const { user } = useAuth()
  const today = getTodayISO()

  const [date, setDate]     = useState(today)
  const [hours, setHours]   = useState('')
  const [notes, setNotes]   = useState('')
  const [saved, setSaved]   = useState(null)  // the existing log entry for this date
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [history, setHistory] = useState([])

  const loadDate = useCallback(async (d) => {
    try {
      const { data } = await api.get('/hours/', { params: { log_date: d } })
      const entry = data.find(r => r.user_id === user?.id) || null
      setSaved(entry)
      if (entry && !editing) {
        setHours(String(entry.hours))
        setNotes(entry.notes || '')
      } else if (!entry) {
        setHours('')
        setNotes('')
      }
    } catch {}
  }, [user?.id, editing])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get('/hours/')
      setHistory(data.filter(r => r.user_id === user?.id).slice(0, 14))
    } catch {}
  }, [user?.id])

  useEffect(() => {
    setEditing(false)
    setSaved(null)
    setHours('')
    setNotes('')
    loadDate(date)
  }, [date])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHistory() }, [loadHistory])

  async function handleSubmit(e) {
    e.preventDefault()
    const h = parseFloat(hours)
    if (isNaN(h) || h < 0 || h > 24) return
    setSaving(true)
    try {
      const { data } = await api.post('/hours/', { log_date: date, hours: h, notes: notes.trim() || null })
      setSaved(data)
      setEditing(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
      loadHistory()
    } catch {} finally { setSaving(false) }
  }

  const isToday = date === today
  const isFuture = date > today
  const showForm = !saved || editing

  return (
    <div className="px-4 pt-6 pb-8 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Timer size={20} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Log Hours</h1>
          <p className="text-slate-500 text-xs">Record your hours worked for the day</p>
        </div>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-700/50 rounded-2xl px-4 py-3 mb-4">
        <button
          onClick={() => setDate(prevDay(date))}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">
            {isToday ? 'Today' : fmtDate(date)}
          </p>
          {isToday && <p className="text-slate-500 text-xs">{fmtDate(date)}</p>}
        </div>
        <button
          onClick={() => setDate(nextDay(date))}
          disabled={isToday}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Existing entry display */}
      {saved && !editing && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle size={16} />
              <span className="text-sm font-semibold">Hours Logged</span>
            </div>
            <button
              onClick={() => { setEditing(true); setHours(String(saved.hours)); setNotes(saved.notes || '') }}
              className="flex items-center gap-1.5 text-slate-400 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
          <p className="text-4xl font-bold text-white mb-1">{saved.hours}<span className="text-lg text-slate-400 ml-1">hrs</span></p>
          {saved.notes && <p className="text-slate-400 text-sm mt-2 italic">"{saved.notes}"</p>}
        </div>
      )}

      {/* Log form */}
      {showForm && !isFuture && (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 mb-4 space-y-4">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
            {saved ? 'Edit hours' : 'Log your hours'}
          </p>

          {/* Hours input */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Hours Worked</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="e.g. 7.5"
                required
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-2xl font-bold text-center rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium pointer-events-none">hrs</span>
            </div>
            {/* Quick-pick buttons */}
            <div className="grid grid-cols-5 gap-1.5 mt-2">
              {[4, 5, 6, 7, 8].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(String(h))}
                  className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                    hours === String(h)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Notes <span className="text-slate-600 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="w-full py-2 text-slate-400 text-sm">
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={saving || !hours}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {success
              ? <><CheckCircle size={18} /> Saved!</>
              : saving
                ? 'Saving…'
                : saved ? 'Update Hours' : 'Log Hours'
            }
          </button>
        </form>
      )}

      {isFuture && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center mb-4">
          <p className="text-slate-500 text-sm">Can't log hours for a future date.</p>
        </div>
      )}

      {/* Recent history */}
      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Clock size={14} className="text-slate-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent</p>
          </div>
          <div className="divide-y divide-slate-800">
            {history.map(entry => {
              const isActive = entry.log_date === date
              return (
                <button
                  key={entry.id}
                  onClick={() => setDate(entry.log_date)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    isActive ? 'bg-indigo-600/10' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${isActive ? 'text-indigo-300' : 'text-slate-300'}`}>
                      {entry.log_date === today ? 'Today' : fmtDate(entry.log_date)}
                    </p>
                    {entry.notes && <p className="text-xs text-slate-600 mt-0.5 truncate max-w-48">{entry.notes}</p>}
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${isActive ? 'text-indigo-300' : 'text-slate-100'}`}>
                    {entry.hours}h
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
