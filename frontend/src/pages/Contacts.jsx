import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../App.jsx'
import { Plus, Search, Pencil, Trash2, Phone, Download, Upload, MessageSquare, MapPin, Wrench, DollarSign, ShieldCheck, RotateCcw, X, PhoneCall, Loader2 } from 'lucide-react'

const STATUS_COLORS = {
  lead: 'bg-blue-900/40 text-blue-400',
  prospect: 'bg-yellow-900/40 text-yellow-400',
  customer: 'bg-emerald-900/40 text-emerald-400',
  inactive: 'bg-slate-700 text-slate-400',
}

const STATUSES = ['lead', 'prospect', 'customer', 'inactive']

const SERVICES_OPTIONS = [
  { value: 'window-ext', label: 'Window – Ext' },
  { value: 'window-int', label: 'Window – Int' },
  { value: 'gutters',    label: 'Gutters' },
  { value: 'pressure-washing', label: 'Pressure Washing' },
]

const EMPTY = {
  first_name: '', last_name: '', phone: '',
  address: '', services: '', price: '', status: 'lead', notes: '',
}

function ServicesDisplay({ services }) {
  if (!services) return <span className="text-slate-500">—</span>
  const tags = services.split(',').map(s => s.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span key={t} className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
      ))}
    </div>
  )
}

export default function Contacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [importing, setImporting] = useState(false)
  const [deduping, setDeduping] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedContacts, setTrashedContacts] = useState([])
  const [confirmPermDelete, setConfirmPermDelete] = useState(null) // contact id pending permanent delete
  const [smsContact, setSmsContact] = useState(null)
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [callingId, setCallingId] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(() => {
    const params = {}
    if (search) params.search = search
    if (filterStatus) params.status = filterStatus
    api.get('/contacts/', { params }).then((r) => setContacts(r.data))
  }, [search, filterStatus])

  useEffect(() => { load() }, [load])

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(c) {
    setForm({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      address: c.address || '',
      services: c.services || '',
      price: c.price != null ? String(c.price) : '',
      status: c.status || 'lead',
      notes: c.notes || '',
    })
    setModal(c)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : null,
      }
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

  async function loadTrash() {
    const { data } = await api.get('/contacts/', { params: { trashed: true, limit: 200 } })
    setTrashedContacts(data)
  }

  async function openTrash() {
    await loadTrash()
    setShowTrash(true)
  }

  async function restore(id) {
    await api.post(`/contacts/${id}/restore`)
    await loadTrash()
    load()
  }

  async function permanentDelete(id) {
    await api.delete(`/contacts/${id}/permanent`)
    setConfirmPermDelete(null)
    await loadTrash()
    load()
  }

  function exportCsv() {
    api.get('/contacts/export/csv', { responseType: 'blob' }).then((r) => {
      const blob = window.URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = blob
      a.setAttribute('download', 'contacts.csv')
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

  async function callContact(id) {
    setCallingId(id)
    try {
      await api.post('/twilio/call', { contact_id: id })
    } catch (err) {
      alert(err.response?.data?.detail || 'Call failed')
    } finally {
      setTimeout(() => setCallingId(null), 3000)
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

  // Toggle a service tag in the comma-separated services string
  function toggleService(value) {
    const current = form.services ? form.services.split(',').map(s => s.trim()).filter(Boolean) : []
    const idx = current.indexOf(value)
    const updated = idx >= 0 ? current.filter(s => s !== value) : [...current, value]
    setForm({ ...form, services: updated.join(', ') })
  }

  async function markAllCustomer() {
    if (!window.confirm(`Mark all ${contacts.length} contacts as "Customer"? This cannot be undone.`)) return
    try {
      const { data } = await api.post('/contacts/mark-all-customer')
      alert(data.message)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update contacts')
    }
  }

  async function deduplicateContacts() {
    if (!window.confirm('This will permanently delete all duplicate contacts (keeping the oldest per name). Continue?')) return
    setDeduping(true)
    try {
      const { data } = await api.post('/contacts/deduplicate')
      alert(data.message)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Deduplication failed')
    } finally { setDeduping(false) }
  }

  async function geocodeAll() {
    if (!window.confirm('This will pin all contacts with an address onto the map. Pins appear one by one as they resolve (~1/sec). Continue?')) return
    setGeocoding(true)
    try {
      const { data } = await api.post('/contacts/geocode-all?force=true')
      if (data.status === 'nothing_to_geocode') {
        alert('All contacts already have map coordinates.')
        setGeocoding(false)
        return
      }
      // Poll contacts every 3s until geocoding finishes (pins fill in live)
      let polls = 0
      const maxPolls = Math.ceil(data.total * 1.5) + 10 // ~1.5s per contact + buffer
      const interval = setInterval(async () => {
        polls++
        await load()
        if (polls >= maxPolls) {
          clearInterval(interval)
          setGeocoding(false)
        }
      }, 3000)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Unknown error'
      alert(`Geocoding request failed: ${msg}`)
      setGeocoding(false)
    }
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="px-4 pt-6 pb-4 md:p-8 overflow-x-auto min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100">Contacts</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          {/* Mobile: just Import + Add */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 border border-slate-600 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload size={15} /> {importing ? '…' : 'Import'}
          </button>
          <button onClick={openTrash} className="flex items-center gap-1.5 border border-slate-700 text-slate-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* Admin bulk-action buttons — desktop only */}
      {user?.role === 'admin' && (
        <div className="hidden md:flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={markAllCustomer}
            className="flex items-center gap-1.5 border border-emerald-700/60 text-emerald-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <ShieldCheck size={15} /> Mark All Closed
          </button>
          <button
            onClick={deduplicateContacts}
            disabled={deduping}
            className="flex items-center gap-1.5 border border-amber-700/60 text-amber-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldCheck size={15} /> {deduping ? 'Cleaning…' : 'Deduplicate'}
          </button>
          <button
            onClick={geocodeAll}
            disabled={geocoding}
            className="flex items-center gap-1.5 border border-indigo-700/60 text-indigo-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <MapPin size={15} /> {geocoding ? 'Geocoding…' : 'Pin on Map'}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 border border-slate-600 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Download size={15} /> Export
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, address, phone, services…"
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

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {contacts.length === 0 && (
          <div className="bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-10 text-center text-slate-500 text-sm">No contacts found</div>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-3 flex items-center gap-3">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center flex-shrink-0 text-indigo-300 font-bold text-sm">
              {c.first_name?.[0]?.toUpperCase()}{c.last_name?.[0]?.toUpperCase() || ''}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-medium text-sm truncate">{c.first_name} {c.last_name || ''}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {c.phone && <span className="text-slate-400 text-xs">{c.phone}</span>}
                {c.address && <span className="text-slate-500 text-xs truncate max-w-[150px]">{c.address}</span>}
              </div>
            </div>
            {/* Status + actions */}
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-700 text-slate-400'}`}>{c.status}</span>
              <div className="flex items-center gap-1">
                {c.phone && <button onClick={() => callContact(c.id)} className="p-1 text-slate-500 hover:text-indigo-400 rounded-md">{callingId === c.id ? <Loader2 size={13} className="animate-spin text-indigo-400" /> : <PhoneCall size={13} />}</button>}
                {c.phone && <button onClick={() => { setSmsContact(c); setSmsMessage('') }} className="p-1 text-slate-500 hover:text-emerald-400 rounded-md"><MessageSquare size={13} /></button>}
                <button onClick={() => openEdit(c)} className="p-1 text-slate-500 hover:text-slate-200 rounded-md"><Pencil size={13} /></button>
                <button onClick={() => setDeleteId(c.id)} className="p-1 text-slate-500 hover:text-red-400 rounded-md"><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-slate-900 rounded-xl border border-slate-700/50 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Address</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Services</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Price</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {contacts.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No contacts found</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3.5 font-medium text-slate-200">
                  {c.first_name} {c.last_name || ''}
                  {c.notes && <span className="block text-xs text-slate-500 font-normal truncate max-w-[180px]">{c.notes}</span>}
                </td>
                <td className="px-6 py-3.5 text-slate-400 max-w-[200px]">
                  {c.address
                    ? <span className="flex items-start gap-1"><MapPin size={13} className="mt-0.5 shrink-0" /><span className="truncate">{c.address}</span></span>
                    : '—'}
                </td>
                <td className="px-6 py-3.5 text-slate-400 whitespace-nowrap">
                  {c.phone ? <span className="flex items-center gap-1"><Phone size={13} />{c.phone}</span> : '—'}
                </td>
                <td className="px-6 py-3.5"><ServicesDisplay services={c.services} /></td>
                <td className="px-6 py-3.5 text-slate-300 whitespace-nowrap">
                  {c.price != null ? <span className="flex items-center gap-1"><DollarSign size={13} className="text-emerald-500" />{c.price.toFixed(2)}</span> : '—'}
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-700 text-slate-400'}`}>{c.status}</span>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    {c.phone && <button onClick={() => callContact(c.id)} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/20 rounded-lg">{callingId === c.id ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : <PhoneCall size={14} />}</button>}
                    {c.phone && <button onClick={() => { setSmsContact(c); setSmsMessage('') }} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 rounded-lg"><MessageSquare size={14} /></button>}
                    <button onClick={() => openEdit(c)} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
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
              <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
              <input value={form.address} onChange={f('address')} className="input" placeholder="123 Main St, City" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input value={form.phone} onChange={f('phone')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Price ($)</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={f('price')} className="input" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Services</label>
              <div className="grid grid-cols-2 gap-2">
                {SERVICES_OPTIONS.map(({ value, label }) => {
                  const active = form.services?.split(',').map(s => s.trim()).includes(value)
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleService(value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-900/30 text-indigo-300'
                          : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <Wrench size={13} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
              <select value={form.status} onChange={f('status')} className="input">
                {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
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

      {/* Delete confirm */}
      {deleteId && (
        <Modal title="Delete Contact" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-slate-400 text-sm mb-6">This will permanently delete the contact and all related data.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
            <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}

      {/* Quick SMS */}
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

      {/* Trash drawer — z-[9999] to sit above BottomNav backdrop-blur stacking context */}
      {showTrash && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowTrash(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl flex flex-col"
            style={{ maxHeight: '70vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-red-400" />
                <span className="text-white font-bold text-base">Trash</span>
                {trashedContacts.length > 0 && (
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                    {trashedContacts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowTrash(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {trashedContacts.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">Trash is empty</p>
              ) : trashedContacts.map(c => (
                <div key={c.id} className="bg-slate-800/80 border border-slate-700/40 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 text-slate-300 font-bold text-sm">
                    {c.first_name?.[0]?.toUpperCase()}{c.last_name?.[0]?.toUpperCase() || ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-semibold text-sm truncate">{c.first_name} {c.last_name || ''}</p>
                    {c.phone && <p className="text-slate-500 text-xs mt-0.5">{c.phone}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => restore(c.id)}
                      className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 px-3 py-1.5 rounded-xl"
                      style={{ minHeight: '36px' }}
                    >
                      <RotateCcw size={11} /> Recover
                    </button>
                    {confirmPermDelete === c.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => permanentDelete(c.id)}
                          className="text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-xl"
                          style={{ minHeight: '36px' }}
                        >
                          Sure?
                        </button>
                        <button
                          onClick={() => setConfirmPermDelete(null)}
                          className="text-xs text-slate-400 bg-slate-700 px-2 py-1.5 rounded-xl"
                          style={{ minHeight: '36px' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmPermDelete(c.id)}
                        className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-900/20 border border-red-700/40 px-3 py-1.5 rounded-xl"
                        style={{ minHeight: '36px' }}
                      >
                        <Trash2 size={11} /> Forever
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
