import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { ClipboardList, Download, ChevronDown } from 'lucide-react'

function getTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatHours(ms) {
  if (!ms || ms <= 0) return '0h 0m'
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}h ${m}m`
}

function msToDecimalHours(ms) {
  return (ms / 3600000).toFixed(2)
}

// Pair up in/out entries per user
function pairEntries(entries) {
  // Group by user_id
  const byUser = {}
  for (const e of entries) {
    if (!byUser[e.user_id]) byUser[e.user_id] = []
    byUser[e.user_id].push(e)
  }

  const rows = []
  for (const userId of Object.keys(byUser)) {
    const userEntries = byUser[userId].sort((a, b) => new Date(a.clocked_at) - new Date(b.clocked_at))
    let openIn = null
    for (const entry of userEntries) {
      if (entry.clock_type === 'in') {
        openIn = entry
      } else if (entry.clock_type === 'out' && openIn) {
        const ms = new Date(entry.clocked_at) - new Date(openIn.clocked_at)
        rows.push({
          userId: parseInt(userId),
          username: entry.username,
          full_name: entry.full_name,
          deal_id: openIn.deal_id || entry.deal_id,
          deal_title: openIn.deal_title || entry.deal_title,
          clockIn: openIn.clocked_at,
          clockOut: entry.clocked_at,
          ms,
          notes: openIn.notes || entry.notes,
        })
        openIn = null
      }
    }
    // Unclosed clock-in (still working)
    if (openIn) {
      rows.push({
        userId: parseInt(userId),
        username: openIn.username,
        full_name: openIn.full_name,
        deal_id: openIn.deal_id,
        deal_title: openIn.deal_title,
        clockIn: openIn.clocked_at,
        clockOut: null,
        ms: Date.now() - new Date(openIn.clocked_at),
        notes: openIn.notes,
        active: true,
      })
    }
  }
  return rows
}

export default function Timesheet() {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [date, setDate] = useState(getTodayISO())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/users/').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = { date }
      if (selectedUser) params.user_id = selectedUser
      const res = await api.get('/timeclock/', { params })
      setEntries(res.data)
    } catch (err) {
      console.error('Failed to load timesheet', err)
    } finally {
      setLoading(false)
    }
  }, [date, selectedUser])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const rows = pairEntries(entries)

  // Group rows by technician for summary
  const summaryByUser = {}
  for (const row of rows) {
    if (!summaryByUser[row.userId]) {
      summaryByUser[row.userId] = { name: row.full_name || row.username, totalMs: 0 }
    }
    summaryByUser[row.userId].totalMs += row.ms
  }

  function exportCSV() {
    const headers = ['Technician', 'Appointment', 'Clock In', 'Clock Out', 'Hours', 'Notes']
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        JSON.stringify(r.full_name || r.username),
        JSON.stringify(r.deal_title || ''),
        formatTime(r.clockIn),
        r.clockOut ? formatTime(r.clockOut) : 'Active',
        msToDecimalHours(r.ms),
        JSON.stringify(r.notes || ''),
      ].join(',')),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheet-${date}${selectedUser ? `-user${selectedUser}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                <ClipboardList size={20} className="text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-100">Timesheet</h1>
            </div>
            <p className="text-slate-500 text-sm ml-13">Admin view — all technician time records</p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-4 mb-6 flex flex-wrap gap-3">
          {/* Technician filter */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Technician</label>
            <div className="relative">
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All technicians</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username}
                    {u.role === 'technician' ? ' (tech)' : u.role === 'admin' ? ' (admin)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Date filter */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <ClipboardList size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No time entries for this date</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 border-b border-slate-700/50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Technician</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Appointment</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Clock In</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Clock Out</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Hours</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center font-semibold text-xs">
                            {(row.full_name || row.username || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-slate-200 font-medium">{row.full_name || row.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 max-w-48">
                        <span className="truncate block">{row.deal_title || '—'}</span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-300 font-mono text-xs">{formatTime(row.clockIn)}</td>
                      <td className="px-6 py-3.5">
                        {row.clockOut ? (
                          <span className="text-slate-300 font-mono text-xs">{formatTime(row.clockOut)}</span>
                        ) : (
                          <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-slate-200 font-medium">{formatHours(row.ms)}</span>
                        <span className="text-slate-500 text-xs ml-1">({msToDecimalHours(row.ms)}h)</span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 text-xs italic max-w-32">
                        <span className="truncate block">{row.notes || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        {Object.keys(summaryByUser).length > 0 && (
          <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-5">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">Daily Summary</h2>
            <div className="divide-y divide-slate-700/30">
              {Object.entries(summaryByUser).map(([userId, summary]) => (
                <div key={userId} className="flex items-center justify-between py-3">
                  <span className="text-slate-300 text-sm font-medium">{summary.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-100 font-semibold">{formatHours(summary.totalMs)}</span>
                    <span className="text-slate-500 text-xs">({msToDecimalHours(summary.totalMs)}h)</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 mt-2">
              <span className="text-slate-400 text-sm font-medium">Total</span>
              <div className="flex items-center gap-3">
                <span className="text-indigo-400 font-bold">
                  {formatHours(Object.values(summaryByUser).reduce((acc, s) => acc + s.totalMs, 0))}
                </span>
                <span className="text-slate-500 text-xs">
                  ({msToDecimalHours(Object.values(summaryByUser).reduce((acc, s) => acc + s.totalMs, 0))}h)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
