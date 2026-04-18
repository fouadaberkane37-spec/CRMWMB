import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { TrendingUp, Users, DoorOpen, CalendarCheck, BarChart3 } from 'lucide-react'

const API = '/api'

function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-400' }) {
  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-slate-400 text-xs font-medium">{label}</span>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function Analytics() {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/analytics/overview`, { headers })
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-6 text-slate-400 text-center">Loading...</div>
  if (!data) return null

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-5">Analytics</h1>

      <section className="mb-7">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Contacts</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label="Total Contacts" value={data.contacts.total} color="text-blue-400" />
          <StatCard icon={Users} label="New This Month" value={data.contacts.new_this_month} color="text-green-400" />
        </div>
      </section>

      <section className="mb-7">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Deals</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={TrendingUp} label="Won Value" value={`$${data.deals.won_value.toLocaleString()}`} color="text-green-400" />
          <StatCard icon={TrendingUp} label="Pipeline" value={`$${data.deals.pipeline_value.toLocaleString()}`} color="text-yellow-400" />
          <StatCard icon={BarChart3} label="Win Rate" value={`${data.deals.win_rate}%`} sub={`${data.deals.won} won of ${data.deals.total}`} color="text-indigo-400" />
          <StatCard icon={BarChart3} label="Open Deals" value={data.deals.open} color="text-blue-400" />
        </div>
      </section>

      <section className="mb-7">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Knock Tracking</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={DoorOpen} label="Total Knocks" value={data.knocks.total} color="text-orange-400" />
          <StatCard icon={DoorOpen} label="Conversion Rate" value={`${data.knocks.conversion_rate}%`} sub={`${data.knocks.interested} interested`} color="text-green-400" />
        </div>
      </section>

      <section>
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Bookings</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={CalendarCheck} label="Total Bookings" value={data.bookings.total} color="text-indigo-400" />
          <StatCard icon={CalendarCheck} label="Completed" value={data.bookings.completed} color="text-green-400" />
        </div>
      </section>
    </div>
  )
}
