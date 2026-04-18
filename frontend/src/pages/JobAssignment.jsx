import React, { useState, useEffect } from 'react'
import { useAuth } from '../App.jsx'
import { Briefcase, Plus, User, Clock, X, Flag } from 'lucide-react'

const API = '/api'
const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  in_progress: 'bg-blue-500/20 text-blue-300',
  completed: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-slate-500/20 text-slate-400',
}
const PRIORITY_COLORS = {
  low: 'text-slate-400',
  normal: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JobAssignment() {
  const { token } = useAuth()
  const [jobs, setJobs] = useState([])
  const [contacts, setContacts] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', contact_id: '', assigned_to: '',
    status: 'pending', priority: 'normal', scheduled_at: '', notes: '',
  })

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function load() {
    setLoading(true)
    const [jRes, cRes, uRes] = await Promise.all([
      fetch(`${API}/jobs/${filterStatus ? `?status=${filterStatus}` : ''}`, { headers }),
      fetch(`${API}/contacts/?limit=500`, { headers }),
      fetch(`${API}/users/`, { headers }),
    ])
    setJobs(await jRes.json())
    setContacts(await cRes.json())
    setTechs((await uRes.json()).filter(u => u.role !== 'sales'))
    setLoading(false)
  }

  useEffect(() => { load() }, [filterStatus])

  function openNew() {
    setEditItem(null)
    setForm({ title: '', description: '', contact_id: '', assigned_to: '', status: 'pending', priority: 'normal', scheduled_at: '', notes: '' })
    setShowForm(true)
  }

  function openEdit(j) {
    setEditItem(j)
    const dt = j.scheduled_at ? new Date(j.scheduled_at).toISOString().slice(0, 16) : ''
    setForm({
      title: j.title, description: j.description || '', contact_id: j.contact_id || '',
      assigned_to: j.assigned_to || '', status: j.status, priority: j.priority,
      scheduled_at: dt, notes: j.notes || '',
    })
    setShowForm(true)
  }

  async function save() {
    const payload = { ...form, contact_id: form.contact_id || null, assigned_to: form.assigned_to || null, scheduled_at: form.scheduled_at || null }
    const url = editItem ? `${API}/jobs/${editItem.id}` : `${API}/jobs/`
    await fetch(url, { method: editItem ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) })
    setShowForm(false)
    load()
  }

  async function updateStatus(id, status) {
    await fetch(`${API}/jobs/${id}/status?status=${status}`, { method: 'PATCH', headers })
    load()
  }

  async function remove(id) {
    if (!confirm('Delete job?')) return
    await fetch(`${API}/jobs/${id}`, { method: 'DELETE', headers })
    load()
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Job Assignment</h1>
          <p className="text-slate-400 text-sm">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New Job
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {['', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Briefcase size={40} className="mx-auto mb-3 opacity-30" />
          <p>No jobs yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(j => (
            <div key={j.id} onClick={() => openEdit(j)}
              className="bg-slate-900 rounded-xl p-4 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{j.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[j.status]}`}>{j.status.replace('_', ' ')}</span>
                    <Flag size={12} className={PRIORITY_COLORS[j.priority]} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                    {j.assignee && <span className="flex items-center gap-1"><User size={11} />{j.assignee.full_name || j.assignee.username}</span>}
                    {j.scheduled_at && <span className="flex items-center gap-1"><Clock size={11} />{fmt(j.scheduled_at)}</span>}
                    {j.contact && <span>{j.contact.first_name} {j.contact.last_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <select value={j.status}
                    onChange={e => updateStatus(j.id, e.target.value)}
                    className="bg-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-700 focus:outline-none">
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <button onClick={() => remove(j.id)} className="text-slate-600 hover:text-red-400 p-1"><X size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-semibold text-lg mb-4">{editItem ? 'Edit Job' : 'New Job'}</h2>
            <div className="space-y-3">
              <input className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Job title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select className="bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <select className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name || t.username}</option>)}
              </select>
              <select className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
                <option value="">No contact</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
              <input type="datetime-local" className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
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
