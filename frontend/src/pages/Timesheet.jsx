import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { Clock, Timer } from 'lucide-react'

const API = '/api'

function duration(entry) {
  const end = entry.clock_out ? new Date(entry.clock_out) : new Date()
  const ms = end - new Date(entry.clock_in)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function fmtDt(dt) {
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Timesheet() {
  const { token, user } = useAuth()
  const [entries, setEntries] = useState([])
  const [users, setUsers] = useState([])
  const [filterUser, setFilterUser] = useState('')
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  async function load() {
    setLoading(true)
    const url = filterUser ? `${API}/timesheet/?user_id=${filterUser}` : `${API}/timesheet/`
    const [eRes, uRes] = await Promise.all([
      fetch(url, { headers }),
      user.role === 'admin' ? fetch(`${API}/users/`, { headers }) : Promise.resolve(null),
    ])
    setEntries(await eRes.json())
    if (uRes) setUsers(await uRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [filterUser])

  const totalMs = entries.reduce((acc, e) => {
    const end = e.clock_out ? new Date(e.clock_out) : new Date()
    return acc + (end - new Date(e.clock_in))
  }, 0)
  const totalH = Math.floor(totalMs / 3600000)
  const totalM = Math.floor((totalMs % 3600000) / 60000)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Timesheet</h1>
          <p className="text-slate-400 text-sm">Total: {totalH}h {totalM}m ({entries.length} entries)</p>
        </div>
        {user.role === 'admin' && (
          <select className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
            value={filterUser} onChange={e => setFilterUser(e.target.value)}>
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Timer size={40} className="mx-auto mb-3 opacity-30" />
          <p>No time entries</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{e.user?.full_name || e.user?.username || `User #${e.user_id}`}</p>
                  <div className="flex gap-4 text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1"><Clock size={11} />{fmtDt(e.clock_in)}</span>
                    <span>→</span>
                    <span>{e.clock_out ? fmtDt(e.clock_out) : <span className="text-green-400">Active</span>}</span>
                  </div>
                  {e.notes && <p className="text-slate-500 text-xs mt-1">{e.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-white font-mono text-sm">{duration(e)}</p>
                  {!e.clock_out && <p className="text-green-400 text-xs">In progress</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
