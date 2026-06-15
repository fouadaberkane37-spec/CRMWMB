import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { ClipboardList, Download, ChevronDown, Users } from 'lucide-react'

function getTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getMonday() {
  const now = new Date()
  const d = new Date(now)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function Timesheet() {
  const today  = getTodayISO()
  const monday = getMonday()

  const [users, setUsers]           = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [fromDate, setFromDate]     = useState(monday)
  const [toDate, setToDate]         = useState(today)
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    api.get('/users/').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { from_date: fromDate, to_date: toDate }
      if (selectedUser) params.user_id = selectedUser
      const { data } = await api.get('/hours/', { params })
      setEntries(data)
    } catch {} finally { setLoading(false) }
  }, [fromDate, toDate, selectedUser])

  useEffect(() => { load() }, [load])

  // Per-tech totals
  const summaryByUser = {}
  for (const e of entries) {
    const key = e.user_id
    if (!summaryByUser[key]) summaryByUser[key] = { name: e.full_name || e.username, total: 0, days: 0 }
    summaryByUser[key].total += e.hours
    summaryByUser[key].days  += 1
  }
  const grandTotal = Object.values(summaryByUser).reduce((s, u) => s + u.total, 0)

  function exportCSV() {
    const headers = ['Technician', 'Date', 'Hours', 'Notes']
    const rows = [
      headers.join(','),
      ...entries.map(e => [
        JSON.stringify(e.full_name || e.username),
        e.log_date,
        e.hours,
        JSON.stringify(e.notes || ''),
      ].join(',')),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `timesheet-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <ClipboardList size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Timesheet</h1>
              <p className="text-slate-500 text-sm">Technician daily hours</p>
            </div>
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
        <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Technician</label>
            <div className="relative">
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All technicians</option>
                {users.filter(u => u.role === 'technician').map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              max={today}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          {/* Shortcuts */}
          <div className="flex gap-2">
            {[
              { label: 'This week', f: monday, t: today },
              { label: 'Today', f: today, t: today },
            ].map(({ label, f, t }) => (
              <button
                key={label}
                onClick={() => { setFromDate(f); setToDate(t) }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  fromDate === f && toDate === t
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        {Object.keys(summaryByUser).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            {Object.entries(summaryByUser).map(([uid, s]) => (
              <div key={uid} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center font-bold text-[10px]">
                    {(s.name || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-slate-300 text-sm font-medium truncate">{s.name}</span>
                </div>
                <p className="text-2xl font-bold text-white">{s.total.toFixed(1)}<span className="text-sm text-slate-400 ml-1">hrs</span></p>
                <p className="text-xs text-slate-500 mt-0.5">{s.days} day{s.days !== 1 ? 's' : ''}</p>
              </div>
            ))}
            {Object.keys(summaryByUser).length > 1 && (
              <div className="bg-indigo-600/10 border border-indigo-600/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-indigo-400" />
                  <span className="text-indigo-300 text-sm font-medium">Total</span>
                </div>
                <p className="text-2xl font-bold text-white">{grandTotal.toFixed(1)}<span className="text-sm text-slate-400 ml-1">hrs</span></p>
                <p className="text-xs text-slate-500 mt-0.5">{entries.length} entries</p>
              </div>
            )}
          </div>
        )}

        {/* Entries table */}
        <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <ClipboardList size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No hours logged for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Technician</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Hours</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0">
                            {(e.full_name || e.username || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-slate-200 font-medium">{e.full_name || e.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">{fmtDate(e.log_date)}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-100 font-bold text-base">{e.hours}</span>
                        <span className="text-slate-500 text-xs ml-1">hrs</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs italic max-w-56">
                        <span className="truncate block">{e.notes || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
