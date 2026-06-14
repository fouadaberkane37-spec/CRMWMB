import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import api, { openInvoice } from '../api.js'
import { ClipboardList, RefreshCw, Loader2, X, Check, DollarSign, FileText } from 'lucide-react'

const WINDOW_SERVICES = [
  { key: 'window-ext', label: 'Windows (Ext)' },
  { key: 'window-int', label: 'Windows (Int)' },
  { key: 'gutters',    label: 'Gutters' },
  { key: 'pressure',   label: 'Pressure Wash' },
  { key: 'roof',       label: 'Roof Cleaning' },
  { key: 'screens',    label: 'Screens' },
  { key: 'solar',      label: 'Solar Panels' },
]

const LANDSCAPE_SERVICES = [
  { key: 'lawn-mowing',   label: 'Lawn Mowing' },
  { key: 'hedge-trim',    label: 'Hedge Trimming' },
  { key: 'landscaping',   label: 'Landscaping' },
  { key: 'snow-removal',  label: 'Snow Removal' },
  { key: 'mulching',      label: 'Mulching' },
  { key: 'aeration',      label: 'Aeration' },
]

const STATUS_CONFIG = {
  todo:            { label: 'To Do',           bg: 'bg-indigo-900/40 text-indigo-400 border-indigo-700/40' },
  payment_pending: { label: 'Payment Pending', bg: 'bg-amber-900/40 text-amber-400 border-amber-700/40' },
  done:            { label: 'Done',            bg: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40' },
  cancelled:       { label: 'Cancelled',       bg: 'bg-slate-800 text-slate-500 border-slate-700/40' },
}

const FILTER_TABS = [
  { key: 'all',             label: 'All' },
  { key: 'todo',            label: 'To Do' },
  { key: 'payment_pending', label: 'Pending' },
  { key: 'done',            label: 'Done' },
]

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ServiceChip({ label }) {
  return (
    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/30 font-medium">
      {label}
    </span>
  )
}

// ── Edit bottom sheet ──────────────────────────────────────────────────────────
function EditSheet({ deal, onClose, onSaved }) {
  const contact = deal.contact || {}
  const allServices = deal.business_type === 'landscape' ? LANDSCAPE_SERVICES : WINDOW_SERVICES

  const [price, setPrice]       = useState(String(deal.value || ''))
  const [services, setServices] = useState(
    (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)
  )
  const [status, setStatus]     = useState(deal.job_status || 'todo')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  function toggleService(key) {
    setServices(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const newValue = parseFloat(price) || 0
      // Update deal value + status
      await api.put(`/deals/${deal.id}`, {
        title: deal.title,
        value: newValue,
        job_status: status,
        stage: deal.stage || 'lead',
        business_type: deal.business_type || 'window',
        contact_id: deal.contact_id,
        expected_close_date: deal.expected_close_date,
      })
      // Update contact services if contact exists
      if (deal.contact_id) {
        await api.put(`/contacts/${deal.contact_id}`, {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          phone: contact.phone || '',
          email: contact.email || '',
          address: contact.address || '',
          services: services.join(','),
        })
      }
      onSaved({ ...deal, value: newValue, job_status: status, contact: { ...contact, services: services.join(',') } })
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl overflow-y-scroll"
        style={{ maxHeight: '92vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)', overscrollBehavior: 'contain' }}
      >
        <div className="px-4 pt-5 space-y-5">
          {/* Handle + header */}
          <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto -mt-1 mb-1" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white font-bold text-base">
                {contact.first_name ? `${contact.first_name} ${contact.last_name || ''}`.trim() : deal.title}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{fmtDate(deal.expected_close_date)}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <X size={16} />
            </button>
          </div>

          {/* Final price */}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Final Price Paid</p>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 gap-2">
              <DollarSign size={16} className="text-emerald-400 shrink-0" />
              <input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="flex-1 bg-transparent text-white text-lg font-bold focus:outline-none placeholder-slate-600"
              />
            </div>
          </div>

          {/* Services sold */}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Services Sold</p>
            <div className="flex flex-wrap gap-2">
              {allServices.map(({ key, label }) => {
                const active = services.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleService(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {active && <Check size={12} className="shrink-0" />}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">Job Status</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    status === key
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => openInvoice(deal.id)}
              className="flex-shrink-0 flex items-center justify-center gap-2 border border-slate-600 text-slate-300 py-3.5 px-4 rounded-2xl text-sm font-semibold"
            >
              <FileText size={16} />
              Invoice
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ClientJobs() {
  const [deals, setDeals]     = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/deals/', { params: { limit: 1000 } })
      const booked = r.data
        .filter(d => d.expected_close_date && d.job_status !== 'cancelled')
        .sort((a, b) => new Date(b.expected_close_date) - new Date(a.expected_close_date))
      setDeals(booked)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(updated) {
    setDeals(prev => prev.map(d => d.id === updated.id ? updated : d))
  }

  const visible = deals.filter(d => {
    if (filter !== 'all' && d.job_status !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const name = d.contact
        ? `${d.contact.first_name} ${d.contact.last_name || ''}`.toLowerCase()
        : (d.title || '').toLowerCase()
      if (!name.includes(q)) return false
    }
    return true
  })

  const totals = {
    all:             deals.length,
    todo:            deals.filter(d => d.job_status === 'todo').length,
    payment_pending: deals.filter(d => d.job_status === 'payment_pending').length,
    done:            deals.filter(d => d.job_status === 'done').length,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <ClipboardList size={20} className="text-indigo-400" />
            <h1 className="text-white text-xl font-bold tracking-tight">Client Jobs</h1>
          </div>
          <p className="text-slate-500 text-xs ml-8">Tap any job to edit price &amp; services</p>
        </div>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by client name…"
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
        />
      </div>

      {/* Filter tabs */}
      <div className="px-4 mb-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === key
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {label}
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${filter === key ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {totals[key] ?? ''}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600">
          <ClipboardList size={40} className="opacity-30" />
          <p className="text-sm">No jobs found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-8">
          {visible.map(deal => {
            const contact  = deal.contact || {}
            const name     = contact.first_name
              ? `${contact.first_name} ${contact.last_name || ''}`.trim()
              : deal.title
            const svcList  = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)
            const allSvcs  = deal.business_type === 'landscape' ? LANDSCAPE_SERVICES : WINDOW_SERVICES
            const svcLabels = svcList.map(k => allSvcs.find(s => s.key === k)?.label || k)
            const st       = STATUS_CONFIG[deal.job_status] || STATUS_CONFIG.todo

            return (
              <button
                key={deal.id}
                onClick={() => setEditing(deal)}
                className="w-full text-left bg-slate-900 border border-slate-700/40 rounded-2xl px-4 py-3.5 active:bg-slate-800/70 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{fmtDate(deal.expected_close_date)}</p>
                    {svcLabels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {svcLabels.map(l => <ServiceChip key={l} label={l} />)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                    <p className="text-emerald-400 font-bold text-base">
                      ${(deal.value || 0).toFixed(0)}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${st.bg}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <EditSheet
          deal={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
