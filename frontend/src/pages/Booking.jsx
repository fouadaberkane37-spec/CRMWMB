import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { CalendarDays, Plus, Clock, User, MapPin, X, ChevronDown } from 'lucide-react'

const API = '/api'
const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']
const TYPES = ['service', 'estimate', 'follow_up', 'install']
const STATUS_COLORS = {
  scheduled: 'bg-blue-500/20 text-blue-300',
  confirmed: 'bg-green-500/20 text-green-300',
  completed: 'bg-slate-500/20 text-slate-300',
  cancelled: 'bg-red-500/20 text-red-300',
  no_show: 'bg-yellow-500/20 text-yellow-300',
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Booking() {
  const { token, user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [contacts, setContacts] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    title: '', contact_id: '', technician_id: '', scheduled_at: '',
    duration_minutes: 60, type: 'service', status: 'scheduled', notes: '', address: '',
  })

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function load() {
    setLoading(true)
    const [bRes, cRes, uRes] = await Promise.all([
      fetch(`${API}/bookings/${filterStatus ? `?status=${filterStatus}` : ''}`, { headers }),
      fetch(`${API}/contacts/?limit=500`, { headers }),
      fetch(`${API}/users/`, { headers }),
    ])
    setBookings(await bRes.json())
    setContacts(await cRes.json())
    setTechs((await uRes.json()).filter(u => u.role === 'technician' || u.role === 'admin'))
    setLoading(false)
  }

  useEffect(() => { load() }, [filterStatus])

  function openNew() {
    setEditItem(null)
    setForm({ title: '', contact_id: '', technician_id: '', scheduled_at: '', duration_minutes: 60, type: 'service', status: 'scheduled', notes: '', address: '' })
    setShowForm(true)
  }

  function openEdit(b) {
    setEditItem(b)
    const dt = b.scheduled_at ? new Date(b.scheduled_at).toISOString().slice(0, 16) : ''
    setForm({
      title: b.title, contact_id: b.contact_id || '', technician_id: b.technician_id || '',
      scheduled_at: dt, duration_minutes: b.duration_minutes, type: b.type,
      status: b.status, notes: b.notes || '', address: b.address || '',
    })
    setShowForm(true)
  }

  async function save() {
    const payload = { ...form, contact_id: form.contact_id || null, technician_id: form.technician_id || null }
    const url = editItem ? `${API}/bookings/${editItem.id}` : `${API}/bookings/`
    const method = editItem ? 'PUT' : 'POST'
    await fetch(url, { method, headers, body: JSON.stringify(payload) })
    setShowForm(false)
    load()
  }

  async function remove(id) {
    if (!confirm('Delete this booking?')) return
    await fetch(`${API}/bookings/${id}`, { method: 'DELETE', headers })
    load()
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Booking</h1>
          <p className="text-slate-400 text-sm">{bookings.length} appointment{bookings.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New Booking
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        {['', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p>No bookings yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => (
            <div key={b.id} onClick={() => openEdit(b)}
              className="bg-slate-900 rounded-xl p-4 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{b.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || 'bg-slate-700 text-slate-300'}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{b.type}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12} />{formatDateTime(b.scheduled_at)} · {b.duration_minutes}m</span>
                    {b.contact && <span className="flex items-center gap-1"><User size={12} />{b.contact.first_name} {b.contact.last_name}</span>}
                    {b.technician && <span className="flex items-center gap-1"><User size={12} />{b.technician.full_name || b.technician.username}</span>}
                    {b.address && <span className="flex items-center gap-1"><MapPin size={12} />{b.address}</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); remove(b.id) }} className="text-slate-600 hover:text-red-400 p-1 shrink-0">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-semibold text-lg mb-4">{editItem ? 'Edit Booking' : 'New Booking'}</h2>
            <div className="space-y-3">
              <input className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <input type="datetime-local" className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <input type="number" className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Duration (minutes)" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))} />
              <select className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
                <option value="">No contact</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
              <select className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.technician_id} onChange={e => setForm(f => ({ ...f, technician_id: e.target.value }))}>
                <option value="">No technician</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
              </select>
              <input className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              <textarea className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
                rows={3} placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={save} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
