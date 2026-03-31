import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Search, Pencil, Trash2, Building2, Mail, Phone, Download, Upload, MessageSquare } from 'lucide-react'

const STATUS_COLORS = {
  lead: 'bg-blue-900/40 text-blue-400',
  prospect: 'bg-yellow-900/40 text-yellow-400',
  customer: 'bg-emerald-900/40 text-emerald-400',
  inactive: 'bg-slate-700 text-slate-400',
}

const STATUSES = ['lead', 'prospect', 'customer', 'inactive']

const EMPTY = {
  first_name: '', last_name: '', email: '', phone: '',
  title: '', company_id: '', status: 'lead', notes: '',
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [companies, setCompanies] = useState([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [importing, setImporting] = useState(false)
  const [smsContact, setSmsContact] = useState(null)
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(() => {
    const params = {}
    if (search) params.search = search
    if (filterStatus) params.status = filterStatus
    api.get('/contacts/', { params }).then((r) => setContacts(r.data))
  }, [search, filterStatus])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/companies/').then((r) => setCompanies(r.data)) }, [])

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(c) {
    setForm({ ...c, company_id: c.company_id || '', notes: c.notes || '' })
    setModal(c)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = { ...form, company_id: form.company_id || null }
      if (modal === 'create') await api.post('/contacts/', payload)
      else await api.put(`/contacts/${modal.id}`, payload)
      setModal(null)
      load()
    } finally { setSaving(false) }
  }

  async function del() {
    await api.delete(`/contacts/${deleteId}`)
    setDeleteId(null)
    load()
  }

  function exportCsv() {
    const base = import.meta.env.VITE_API_URL || '/api'
    const token = localStorage.getItem('token')
    // Build URL and trigger download via a temporary link
    const url = `${base}/contacts/export/csv`
    const a = document.createElement('a')
    a.href = url
    a.setAttribute('download', 'contacts.csv')
    // Pass auth via a short-lived fetch → blob URL
    api.get('/contacts/export/csv', { responseType: 'blob' }).then((r) => {
      const blob = window.URL.createObjectURL(r.data)
      a.href = blob
      a.click()
      window.URL.revokeObjectURL(blob)
    })
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/contacts/import/csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      alert(`Imported ${data.imported} contacts`)
      load()
    } catch {
      alert('Import failed — check the CSV format')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function sendSms() {
    if (!smsMessage.trim()) return
    setSmsSending(true)
    try {
      await api.post('/sms/send', { contact_id: smsContact.id, message: smsMessage.trim() })
      alert(`SMS sent to ${smsContact.first_name}!`)
      setSmsContact(null)
      setSmsMessage('')
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send SMS')
    } finally { setSmsSending(false) }
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contacts</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload size={15} /> {importing ? 'Importing…' : 'Import'}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
          >
            <Download size={15} /> Export
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Email</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Company</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {contacts.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No contacts found</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3.5 font-medium text-slate-200">
                  {c.first_name} {c.last_name}
                  {c.title && <span className="block text-xs text-slate-500 font-normal">{c.title}</span>}
                </td>
                <td className="px-6 py-3.5 text-slate-400">
                  {c.email ? <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-indigo-400"><Mail size={13} />{c.email}</a> : '—'}
                </td>
                <td className="px-6 py-3.5 text-slate-400">
                  {c.phone ? <span className="flex items-center gap-1"><Phone size={13} />{c.phone}</span> : '—'}
                </td>
                <td className="px-6 py-3.5 text-slate-400">
                  {c.company ? <span className="flex items-center gap-1"><Building2 size={13} />{c.company.name}</span> : '—'}
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-700 text-slate-400'}`}>{c.status}</span>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    {c.phone && (
                      <button onClick={() => { setSmsContact(c); setSmsMessage('') }} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 rounded-lg" title="Send SMS"><MessageSquare size={14} /></button>
                    )}
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
        <Modal title={modal === 'create' ? 'New Contact' : 'Edit Contact'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">First Name *</label>
                <input value={form.first_name} onChange={f('first_name')} className="input" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                <input value={form.last_name} onChange={f('last_name')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input value={form.phone} onChange={f('phone')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Job Title</label>
                <input value={form.title} onChange={f('title')} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Company</label>
                <select value={form.company_id} onChange={f('company_id')} className="input">
                  <option value="">None</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                <select value={form.status} onChange={f('status')} className="input">
                  {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
              <textarea value={form.notes} onChange={f('notes')} rows={3} className="input resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving || !form.first_name} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete Contact" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-slate-400 text-sm mb-6">This will permanently delete the contact and all related data.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
            <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}

      {smsContact && (
        <Modal title={`Send SMS to ${smsContact.first_name} ${smsContact.last_name || ''}`} onClose={() => setSmsContact(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
              <Phone size={14} />
              <span>{smsContact.phone}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Message</label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                rows={4}
                placeholder="Type your message..."
                className="input resize-none"
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1 text-right">{smsMessage.length} / 160 chars</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setSmsContact(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
              <button
                onClick={sendSms}
                disabled={smsSending || !smsMessage.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <MessageSquare size={15} />
                {smsSending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
