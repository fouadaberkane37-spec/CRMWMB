import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { CalendarDays, Clock, MapPin, User } from 'lucide-react'

const API = '/api'

const STATUS_COLORS = {
  scheduled: 'border-l-blue-400',
  confirmed: 'border-l-green-400',
  completed: 'border-l-slate-400',
  cancelled: 'border-l-red-400',
  no_show: 'border-l-yellow-400',
}

function fmt(dt) {
  return new Date(dt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TechSchedule() {
  const { token, user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    async function load() {
      const [bRes, jRes] = await Promise.all([
        fetch(`${API}/bookings/?technician_id=${user.id}&limit=100`, { headers }),
        fetch(`${API}/jobs/?assigned_to=${user.id}&limit=100`, { headers }),
      ])
      setBookings(await bRes.json())
      setJobs(await jRes.json())
      setLoading(false)
    }
    load()
  }, [])

  const upcoming = bookings
    .filter(b => b.status !== 'completed' && b.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'in_progress')

  if (loading) return <div className="p-6 text-slate-400 text-center">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-5">My Schedule</h1>

      <section className="mb-7">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Upcoming Bookings ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <div className="text-slate-600 text-sm text-center py-8">
            <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
            <p>No upcoming bookings</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map(b => (
              <div key={b.id} className={`bg-slate-900 rounded-xl p-4 border-l-4 ${STATUS_COLORS[b.status] || 'border-l-slate-600'} border border-slate-800`}>
                <p className="text-white font-medium">{b.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={11} />{fmt(b.scheduled_at)} · {b.duration_minutes}m</span>
                  {b.contact && <span className="flex items-center gap-1"><User size={11} />{b.contact.first_name} {b.contact.last_name}</span>}
                  {b.address && <span className="flex items-center gap-1"><MapPin size={11} />{b.address}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Active Jobs ({activeJobs.length})</h2>
        {activeJobs.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-4">No active jobs</p>
        ) : (
          <div className="space-y-2">
            {activeJobs.map(j => (
              <div key={j.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-white font-medium">{j.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${j.status === 'in_progress' ? 'bg-blue-500/20 text-blue-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {j.status.replace('_', ' ')}
                  </span>
                </div>
                {j.contact && <p className="text-slate-400 text-xs mt-1">{j.contact.first_name} {j.contact.last_name}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
