import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Phone, Mail, Calendar, FileText, CheckSquare, CheckCircle2, Circle, Trash2 } from 'lucide-react'

const TYPES = [
  { key: 'call', label: 'Call', icon: Phone, color: 'text-blue-400 bg-blue-900/30' },
  { key: 'email', label: 'Email', icon: Mail, color: 'text-indigo-400 bg-indigo-900/30' },
  { key: 'meeting', label: 'Meeting', icon: Calendar, color: 'text-purple-400 bg-purple-900/30' },
  { key: 'note', label: 'Note', icon: FileText, color: 'text-yellow-400 bg-yellow-900/30' },
  { key: 'task', label: 'Task', icon: CheckSquare, color: 'text-emerald-400 bg-emerald-900/30' },
]

const EMPTY = {
  type: 'note', title: '', description: '', contact_id: '',
  deal_id: '', due_date: '', completed: false,
}

function TypeIcon({ type, size = 16 }) {
  const t = TYPES.find((x) => x.key === type) || TYPES[3]
  const Icon = t.icon
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${t.color}`}>
      <Icon size={size} />
    </div>
  )
}

export default function Activities() {
  const [activities, setActivities] = useState([])
  const [contacts, setContacts] = useState([])
  const [filterType, setFilterType] = useState('')
  const [filterCompleted, setFilterCompleted] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    const params = {}
    if (filterType) params.type = filterType
    if (filterCompleted !== '') params.completed = filterCompleted === 'true'
    api.get('/activities/', { params }).then((r) => setActivities(r.data))
  }, [filterType, filterCompleted])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/contacts/').then((r) => setContacts(r.data)) }, [])

  function openCreate() { setForm(EMPTY); setModal('create') }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        contact_id: form.contact_id || null,
        deal_id: form.deal_id || null,
        due_date: form.due_date || null,
      }
      if (modal === 'create') await api.post('/activities/', payload)
      else await api.put(`/activities/${modal.id}`, payload)
      setModal(null)
      load()
    } finally { setSaving(false) }
  }

  async function complete(id) {
    await api.patch(`/activities/${id}/complete`)
    load()
  }

  async function del(id) {
    await api.delete(`/activities/${id}`)
    load()
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const formatDate = (d) => {
    if (!d) return null
    const dt = new Date(d)
    const now = new Date()
    const diff = (dt - now) / 86400000
    if (Math.abs(diff) < 1) return 'Today'
    if (diff < 0) return `${Math.abs(Math.floor(diff))}d ago`
    return dt.toLocaleDateString()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Activities</h1>
          <p className="text-slate-500 text-sm mt-0.5">{activities.length} records</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Log Activity
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select
          value={filterCompleted}
          onChange={(e) => setFilterCompleted(e.target.value)}
          className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All</option>
          <option value="false">Open</option>
          <option value="true">Completed</option>
        </select>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {activities.length === 0 && (
          <div className="bg-slate-900 rounded-xl border border-slate-700/50 px-6 py-12 text-center text-slate-500">No activities yet</div>
        )}
        {activities.map((a) => (
          <div key={a.id} className={`bg-slate-900 rounded-xl border border-slate-700/50 px-5 py-4 flex items-start gap-4 transition-opacity ${a.completed ? 'opacity-50' : ''}`}>
            <TypeIcon type={a.type} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${a.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>{a.title}</p>
                <span className="text-xs text-slate-500 capitalize bg-slate-800 px-2 py-0.5 rounded-full">{a.type}</span>
              </div>
              {a.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{a.description}</p>}
              <div className="flex items-center gap-3 mt-1">
                {a.contact && (
                  <span className="text-xs text-slate-500">{a.contact.first_name} {a.contact.last_name}</span>
                )}
                {a.due_date && (
                  <span className={`text-xs ${!a.completed && new Date(a.due_date) < new Date() ? 'text-red-400' : 'text-slate-500'}`}>
                    {formatDate(a.due_date)}
                  </span>
                )}
                <span className="text-xs text-slate-600">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!a.completed && (
                <button onClick={() => complete(a.id)} className="p-1.5 text-slate-500 hover:text-emerald-400 rounded-lg" title="Mark complete">
                  <Circle size={16} />
                </button>
              )}
              {a.completed && <CheckCircle2 size={16} className="text-emerald-500 mx-1.5" />}
              <button onClick={() => del(a.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Log Activity" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
              <div className="flex gap-2 flex-wrap">
                {TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.key}
                      onClick={() => setForm({ ...form, type: t.key })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.type === t.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-600 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      <Icon size={13} /> {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
              <input value={form.title} onChange={f('title')} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
              <textarea value={form.description} onChange={f('description')} rows={3} className="input resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Contact</label>
                <select value={form.contact_id} onChange={f('contact_id')} className="input">
                  <option value="">None</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={f('due_date')} className="input" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving || !form.title} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Log'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
