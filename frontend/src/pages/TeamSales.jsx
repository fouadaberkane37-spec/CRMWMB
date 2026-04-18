import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { TrendingUp, Medal } from 'lucide-react'

const API = '/api'

function medal(i) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `#${i + 1}`
}

export default function TeamSales() {
  const { token } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/analytics/team-sales`, { headers })
      const raw = await res.json()
      setData(raw.sort((a, b) => b.value - a.value))
      setLoading(false)
    }
    load()
  }, [])

  const topValue = data[0]?.value || 1

  if (loading) return <div className="p-6 text-slate-400 text-center">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-5">Team Sales</h1>

      {data.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p>No sales data yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((rep, i) => (
            <div key={rep.user_id} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg w-8">{medal(i)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{rep.name}</span>
                    <span className="text-green-400 font-semibold">${rep.value.toLocaleString()}</span>
                  </div>
                  <p className="text-slate-500 text-xs">{rep.deals} deal{rep.deals !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
                  style={{ width: `${(rep.value / topValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
