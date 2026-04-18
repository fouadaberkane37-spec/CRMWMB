import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { UserPlus, TrendingUp } from 'lucide-react'

const API = '/api'

export default function NewNumbers() {
  const { token } = useAuth()
  const [data, setData] = useState([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`${API}/analytics/new-numbers?days=${days}`, { headers })
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [days])

  const total = data.reduce((s, d) => s + d.count, 0)
  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">New Numbers</h1>
          <p className="text-slate-400 text-sm">{total} new contacts in last {days} days</p>
        </div>
        <select className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
          value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <UserPlus size={40} className="mx-auto mb-3 opacity-30" />
          <p>No new contacts in this period</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(d => (
            <div key={d.date} className="flex items-center gap-3">
              <span className="text-slate-500 text-xs w-24 shrink-0">{d.date}</span>
              <div className="flex-1 h-6 bg-slate-800 rounded-lg overflow-hidden relative">
                <div
                  className="h-full bg-indigo-600 rounded-lg transition-all duration-300"
                  style={{ width: `${(d.count / max) * 100}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-xs text-white font-medium">{d.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
