import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { ChevronLeft, ChevronRight, Clock, User } from 'lucide-react'

const API = '/api'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_DOT = {
  scheduled: 'bg-blue-400',
  confirmed: 'bg-green-400',
  completed: 'bg-slate-400',
  cancelled: 'bg-red-400',
  no_show: 'bg-yellow-400',
}

export default function Calendar() {
  const { token } = useAuth()
  const [today] = useState(new Date())
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [bookings, setBookings] = useState([])
  const [selected, setSelected] = useState(null)

  const headers = { Authorization: `Bearer ${token}` }

  async function load(year, month) {
    const from = new Date(year, month, 1).toISOString()
    const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const res = await fetch(`${API}/bookings/?from_date=${from}&to_date=${to}&limit=500`, { headers })
    setBookings(await res.json())
  }

  useEffect(() => { load(current.getFullYear(), current.getMonth()) }, [current])

  function prevMonth() { setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1)) }
  function nextMonth() { setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1)) }

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function bookingsOnDay(d) {
    return bookings.filter(b => {
      const bd = new Date(b.scheduled_at)
      return bd.getFullYear() === year && bd.getMonth() === month && bd.getDate() === d
    })
  }

  const selectedBookings = selected ? bookingsOnDay(selected) : []

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronLeft size={18} /></button>
          <span className="text-white font-medium text-sm w-36 text-center">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Grid header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />
          const dayBookings = bookingsOnDay(day)
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
          const isSelected = day === selected
          return (
            <button
              key={day}
              onClick={() => setSelected(day === selected ? null : day)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1 transition-colors relative ${
                isSelected ? 'bg-indigo-600' : isToday ? 'bg-indigo-900/50 ring-1 ring-indigo-500' : 'hover:bg-slate-800'
              }`}
            >
              <span className={`text-xs font-medium ${isSelected ? 'text-white' : isToday ? 'text-indigo-300' : 'text-slate-300'}`}>{day}</span>
              {dayBookings.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5">
                  {dayBookings.slice(0, 3).map(b => (
                    <span key={b.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status] || 'bg-slate-400'}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day events */}
      {selected && (
        <div className="mt-5">
          <h2 className="text-white font-medium mb-3">
            {MONTHS[month]} {selected} — {selectedBookings.length} booking{selectedBookings.length !== 1 ? 's' : ''}
          </h2>
          {selectedBookings.length === 0 ? (
            <p className="text-slate-500 text-sm">No bookings on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedBookings.map(b => (
                <div key={b.id} className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm">{b.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_DOT[b.status]?.replace('bg-', 'bg-').replace('400', '400/20') || ''} text-slate-300`}>{b.status}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={11} />{new Date(b.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {b.duration_minutes}m</span>
                    {b.technician && <span className="flex items-center gap-1"><User size={11} />{b.technician.full_name || b.technician.username}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
