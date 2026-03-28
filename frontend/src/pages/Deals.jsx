import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, DollarSign, Pencil, Trash2, ChevronRight, ChevronLeft } from 'lucide-react'

const STAGES = [
  { key: 'lead', label: 'Lead', color: 'bg-blue-950/50 border-blue-800/50', badge: 'bg-blue-900/40 text-blue-400' },
  { key: 'qualified', label: 'Qualified', color: 'bg-indigo-950/50 border-indigo-800/50', badge: 'bg-indigo-900/40 text-indigo-400' },
  { key: 'proposal', label: 'Proposal', color: 'bg-purple-950/50 border-purple-800/50', badge: 'bg-purple-900/40 text-purple-400' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-orange-950/50 border-orange-800/50', badge: 'bg-orange-900/40 text-orange-400' },
  { key: 'won', label: 'Won', color: 'bg-emerald-950/50 border-emerald-800/50', badge: 'bg-emerald-900/40 text-emerald-400' },
  { key: 'lost', label: 'Lost', color: 'bg-red-950/50 border-red-800/50', badge: 'bg-red-900/40 text-red-400' },
]

const EMPTY = {
  title: '', value: 0, stage: 'lead', contact_id: '', company_id: '',
  expected_close_date: '', notes: '', assigned_to: '',
}

const fmt = (n) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : n > 0 ? `$${n}` : ''

export default function Deals() {
  const [deals, setDeals] = useState([])
  const [contacts, setContacts] = useState([])
  const [companies, setCompanies] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(() => {
    api.get('/deals/?limit=500').then((r) => setDeals(r.data))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get('/contacts/').then((r) => setContacts(r.data))
    api.get('/companies/').then((r) => setCompanies(r.data))
  }, [])

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(d) {
    setForm({
      ...d,
      contact_id: d.contact_id || '',
      company_id: d.company_id || '',
      assigned_to: d.assigned_to || '',
      expected_close_date: d.expected_close_date ? d.expected_close_date.slice(0, 10) : '',
      notes: d.notes || '',
    })
    setModal(d)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        value: parseFloat(form.value) || 0,
        contact_id: form.contact_id || null,
        company_id: form.company_id || null,
        assigned_to: form.assigned_to || null,
        expected_close_date: form.expected_close_date || null,
      }
      if (modal === 'create') await api.post('/deals/', payload)
      else await api.put(`/deals/${modal.id}`, payload)
      setModal(null)
      load()
    } finally { setSaving(false) }
  }

  async function moveStage(deal, direction) {
    const idx = STAGES.findIndex((s) => s.key === deal.stage)
    const next = STAGES[idx + direction]
    if (!next) return
    await api.patch(`/deals/${deal.id}/stage?stage=${next.key}`)
    load()
  }

  async function del() {
    await api.delete(`/deals/${deleteId}`)
    setDeleteId(null)
    load()
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const byStage = (key) => deals.filter((d) => d.stage === key)
  const stageValue = (key) => deals.filter((d) => d.stage === key).reduce((s, d) => s + d.value, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Pipeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">{deals.length} deals</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Add Deal
        </button>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage, stageIdx) => {
          const cards = byStage(stage.key)
          const total = stageValue(stage.key)
          return (
            <div key={stage.key} className="flex-shrink-0 w-64">
              <div className={`rounded-t-xl border-t border-x px-4 py-3 ${stage.color}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stage.badge}`}>{stage.label}</span>
                  <span className="text-xs text-slate-500">{cards.length}</span>
                </div>
                {total > 0 && <p className="text-xs text-slate-500 mt-1">{fmt(total)}</p>}
              </div>

              <div className={`border rounded-b-xl border-t-0 min-h-[200px] p-2 space-y-2 ${stage.color}`}>
                {cards.map((deal) => {
                  const canLeft = stageIdx > 0
                  const canRight = stageIdx < STAGES.length - 1
                  return (
                    <div key={deal.id} className="bg-slate-800 rounded-lg border border-slate-700/50 p-3">
                      <p className="text-sm font-semibold text-slate-200 leading-tight">{deal.title}</p>
                      {deal.value > 0 && (
                        <p className="text-sm text-indigo-400 font-medium mt-1 flex items-center gap-0.5">
                          <DollarSign size={12} />{deal.value.toLocaleString()}
                        </p>
                      )}
                      {deal.contact && (
                        <p className="text-xs text-slate-500 mt-1">
                          {deal.contact.first_name} {deal.contact.last_name}
                        </p>
                      )}
                      {deal.expected_close_date && (
                        <p className="text-xs text-slate-500">
                          Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-700/50">
                        <button
                          onClick={() => moveStage(deal, -1)}
                          disabled={!canLeft}
                          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 rounded"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => moveStage(deal, 1)}
                          disabled={!canRight}
                          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 rounded"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => openEdit(deal)} className="p-1 text-slate-600 hover:text-slate-300 rounded"><Pencil size={13} /></button>
                        <button onClick={() => setDeleteId(deal.id)} className="p-1 text-slate-600 hover:text-red-400 rounded"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New Deal' : 'Edit Deal'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
              <input value={form.title} onChange={f('title')} className="input" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Value ($)</label>
                <input type="number" value={form.value} onChange={f('value')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Stage</label>
                <select value={form.stage} onChange={f('stage')} className="input">
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
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
                <label className="block text-sm font-medium text-slate-300 mb-1">Company</label>
                <select value={form.company_id} onChange={f('company_id')} className="input">
                  <option value="">None</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Expected Close Date</label>
              <input type="date" value={form.expected_close_date} onChange={f('expected_close_date')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
              <textarea value={form.notes} onChange={f('notes')} rows={3} className="input resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving || !form.title} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete Deal" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-slate-400 text-sm mb-6">Permanently delete this deal?</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
            <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
