import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Search, Pencil, Trash2, Globe, Phone } from 'lucide-react'

const EMPTY = {
  name: '', industry: '', website: '', phone: '',
  address: '', city: '', country: '', notes: '',
}

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(() => {
    const params = {}
    if (search) params.search = search
    api.get('/companies/', { params }).then((r) => setCompanies(r.data))
  }, [search])

  useEffect(() => { load() }, [load])

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(c) { setForm({ ...c, notes: c.notes || '' }); setModal(c) }

  async function save() {
    setSaving(true)
    try {
      if (modal === 'create') await api.post('/companies/', form)
      else await api.put(`/companies/${modal.id}`, form)
      setModal(null)
      load()
    } finally { setSaving(false) }
  }

  async function del() {
    await api.delete(`/companies/${deleteId}`)
    setDeleteId(null)
    load()
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Companies</h1>
          <p className="text-slate-500 text-sm mt-0.5">{companies.length} records</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Add Company
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Industry</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Website</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Location</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {companies.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No companies found</td></tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3.5 font-medium text-slate-200">{c.name}</td>
                <td className="px-6 py-3.5 text-slate-400">{c.industry || '—'}</td>
                <td className="px-6 py-3.5 text-slate-400">
                  {c.website
                    ? <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-400 hover:underline"><Globe size={13} />{c.website.replace(/^https?:\/\//, '')}</a>
                    : '—'}
                </td>
                <td className="px-6 py-3.5 text-slate-400">
                  {c.phone ? <span className="flex items-center gap-1"><Phone size={13} />{c.phone}</span> : '—'}
                </td>
                <td className="px-6 py-3.5 text-slate-400">
                  {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New Company' : 'Edit Company'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
              <input value={form.name} onChange={f('name')} className="input" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Industry</label>
                <input value={form.industry} onChange={f('industry')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input value={form.phone} onChange={f('phone')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Website</label>
              <input value={form.website} onChange={f('website')} className="input" placeholder="https://" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
              <input value={form.address} onChange={f('address')} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">City</label>
                <input value={form.city} onChange={f('city')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Country</label>
                <input value={form.country} onChange={f('country')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
              <textarea value={form.notes} onChange={f('notes')} rows={3} className="input resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete Company" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-slate-400 text-sm mb-6">This will permanently delete the company.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
            <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
