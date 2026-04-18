import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { Clock, LogIn, LogOut, CheckCircle2 } from 'lucide-react'

const API = '/api'

function elapsed(since) {
  const secs = Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ClockInOut() {
  const { token } = useAuth()
  const [activeEntry, setActiveEntry] = useState(null)
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function loadActive() {
    const res = await fetch(`${API}/timesheet/active`, { headers })
    const data = await res.json()
    setActiveEntry(data)
    setLoading(false)
  }

  useEffect(() => { loadActive() }, [])

  useEffect(() => {
    if (!activeEntry) return
    const iv = setInterval(() => setTicker(elapsed(activeEntry.clock_in)), 1000)
    setTicker(elapsed(activeEntry.clock_in))
    return () => clearInterval(iv)
  }, [activeEntry])

  async function clockIn() {
    const res = await fetch(`${API}/timesheet/clock-in`, {
      method: 'POST', headers,
      body: JSON.stringify({ notes: notes || null }),
    })
    if (res.ok) { setNotes(''); loadActive() }
  }

  async function clockOut() {
    const res = await fetch(`${API}/timesheet/clock-out`, {
      method: 'POST', headers,
      body: JSON.stringify({ notes: notes || null }),
    })
    if (res.ok) { setNotes(''); setActiveEntry(null); setTicker('') }
  }

  if (loading) return <div className="p-6 text-slate-400 text-center">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">Clock In / Out</h1>

      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 text-center mb-6">
        {activeEntry ? (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <p className="text-green-400 font-semibold mb-1">Clocked In</p>
            <p className="text-slate-400 text-sm mb-3">
              Since {new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <div className="text-4xl font-mono font-bold text-white mb-6">{ticker}</div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Clock size={32} className="text-slate-500" />
            </div>
            <p className="text-slate-400 font-medium mb-1">Not Clocked In</p>
            <p className="text-slate-600 text-sm mb-6">Tap below to start your shift</p>
          </>
        )}

        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full bg-slate-800 text-white rounded-xl px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none mb-4"
        />

        {activeEntry ? (
          <button onClick={clockOut}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-semibold transition-colors">
            <LogOut size={20} /> Clock Out
          </button>
        ) : (
          <button onClick={clockIn}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-semibold transition-colors">
            <LogIn size={20} /> Clock In
          </button>
        )}
      </div>
    </div>
  )
}
