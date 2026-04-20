import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import {
  Plus, X, Phone, MapPin, DollarSign, ChevronRight, Wrench,
  CalendarDays, Pencil, Trash2, Leaf, Check, Loader2, Navigation,
} from 'lucide-react'

const STAGES = [
  { key: 'lead',        label: 'Finding Client', color: 'bg-slate-600',   text: 'text-white',         dot: 'bg-slate-400',    badge: 'bg-slate-800 border-slate-600 text-slate-300' },
  { key: 'qualified',   label: 'Quote',          color: 'bg-blue-600',    text: 'text-white',         dot: 'bg-blue-400',     badge: 'bg-blue-900/40 border-blue-700/50 text-blue-300' },
  { key: 'proposal',    label: 'Negotiation',    color: 'bg-amber-600',   text: 'text-white',         dot: 'bg-amber-400',    badge: 'bg-amber-900/40 border-amber-700/50 text-amber-300' },
  { key: 'negotiation', label: 'Approval',       color: 'bg-purple-600',  text: 'text-white',         dot: 'bg-purple-400',   badge: 'bg-purple-900/40 border-purple-700/50 text-purple-300' },
  { key: 'won',         label: 'Construction',   color: 'bg-emerald-600', text: 'text-white',         dot: 'bg-emerald-400',  badge: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300' },
  { key: 'lost',        label: 'Lost',           color: 'bg-red-900',     text: 'text-red-300',       dot: 'bg-red-600',      badge: 'bg-red-950/60 border-red-800/50 text-red-400' },
]
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))
const ACTIVE_STAGES = STAGES.filter(s => s.key !== 'lost')

const SERVICES = [
  { value: 'pavers-pressure', label: 'Pavers Pressure Washing' },
  { value: 'pavers-relevel',  label: 'Pavers Relevel' },
  { value: 'pavers-install',  label: 'Pavers Install' },
]
const SVC_MAP = Object.fromEntries(SERVICES.map(s => [s.value, s.label]))

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

// ── Lead Form (new lead or edit) ───────────────────────────────────────────────
function LeadForm({ initial, onSave, onClose }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    firstName: initial?.contact?.first_name || '',
    lastName:  initial?.contact?.last_name  || '',
    phone:     initial?.contact?.phone      || '',
    address:   initial?.contact?.address    || '',
    services:  (initial?.contact?.services || '').split(',').map(s => s.trim()).filter(Boolean),
    value:     initial?.value != null ? String(initial.value) : '',
    notes:     initial?.notes || '',
    stage:     initial?.stage || 'lead',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function toggleSvc(v) {
    setForm(f => ({ ...f, services: f.services.includes(v) ? f.services.filter(x => x !== v) : [...f.services, v] }))
  }

  async function handleSave() {
    if (!form.firstName.trim()) { setError('First name required'); return }
    setSaving(true); setError('')
    try {
      if (initial) {
        // Edit: update contact + deal
        await api.put(`/contacts/${initial.contact.id}`, {
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim() || null,
          phone:      form.phone.trim()    || null,
          address:    form.address.trim()  || null,
          services:   form.services.join(',') || null,
        })
        const svcLabel = form.services.map(s => SVC_MAP[s] || s).join(', ') || 'Pavers'
        await api.put(`/deals/${initial.id}`, {
          title:    `${form.firstName} ${form.lastName}`.trim() + ` — ${svcLabel}`,
          value:    form.value !== '' ? parseFloat(form.value) : 0,
          notes:    form.notes.trim() || null,
          stage:    form.stage,
          business_type: 'landscape',
          contact_id: initial.contact.id,
        })
      } else {
        // New: create contact then deal
        const { data: contact } = await api.post('/contacts/', {
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim()  || null,
          phone:      form.phone.trim()     || null,
          address:    form.address.trim()   || null,
          services:   form.services.join(',') || null,
          status:     'prospect',
        })
        if (form.address.trim()) api.post(`/contacts/${contact.id}/geocode`).catch(() => {})
        const svcLabel = form.services.map(s => SVC_MAP[s] || s).join(', ') || 'Pavers'
        await api.post('/deals/', {
          title:         `${form.firstName} ${form.lastName}`.trim() + ` — ${svcLabel}`,
          value:         form.value !== '' ? parseFloat(form.value) : 0,
          stage:         form.stage,
          contact_id:    contact.id,
          notes:         form.notes.trim() || null,
          assigned_to:   user?.id,
          business_type: 'landscape',
          job_status:    'todo',
        })
      }
      onSave()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  const INPUT = 'w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500'

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[#050f0a] rounded-t-2xl px-4 pt-5 overflow-y-auto"
        style={{ maxHeight: '92vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <div className="w-10 h-1 bg-emerald-900 rounded-full mx-auto -mt-1 mb-4" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">{initial ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">First Name *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jean" className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Last Name</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Tremblay" className={INPUT} />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block flex items-center gap-1"><Phone size={11} /> Phone</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="450-555-1234" className={INPUT} />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block flex items-center gap-1"><MapPin size={11} /> Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Rue des Érables, Saint-Jérôme" className={INPUT} />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block flex items-center gap-1"><Wrench size={11} /> Services</label>
            <div className="flex flex-col gap-2">
              {SERVICES.map(s => {
                const active = form.services.includes(s.value)
                return (
                  <button key={s.value} type="button" onClick={() => toggleSvc(s.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      active ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block flex items-center gap-1"><DollarSign size={11} /> Estimate ($)</label>
            <input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0.00" className={INPUT} />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Stage</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVE_STAGES.map(st => (
                <button key={st.key} type="button" onClick={() => set('stage', st.key)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    form.stage === st.key ? `${st.color} ${st.text} border-transparent` : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              placeholder="Site details, special requirements…"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : initial ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Deal Detail Sheet ──────────────────────────────────────────────────────────
function DealSheet({ deal, onClose, onUpdated, onDeleted }) {
  const navigate = useNavigate()
  const [editing, setEditing]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [moving, setMoving]       = useState(false)

  const contact  = deal.contact || {}
  const name     = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || deal.title
  const address  = contact.address || ''
  const mapsUrl  = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null
  const stage    = STAGE_MAP[deal.stage] || STAGE_MAP.lead
  const services = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)

  const stageIdx   = STAGES.findIndex(s => s.key === deal.stage)
  const nextStage  = STAGES[stageIdx + 1]
  const canAdvance = nextStage && nextStage.key !== 'lost'

  async function moveToStage(key) {
    setMoving(true)
    try {
      await api.patch(`/deals/${deal.id}/stage`, null, { params: { stage: key } })
      onUpdated()
      onClose()
    } finally { setMoving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/deals/${deal.id}`)
      onDeleted(deal.id)
      onClose()
    } catch { setDeleting(false) }
  }

  if (editing) {
    return <LeadForm initial={deal} onSave={() => { setEditing(false); onUpdated() }} onClose={() => setEditing(false)} />
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[#050f0a] rounded-t-2xl px-4 pt-5 overflow-y-auto"
        style={{ maxHeight: '90vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <div className="w-10 h-1 bg-emerald-900 rounded-full mx-auto -mt-1 mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${stage.badge}`}>{stage.label}</span>
            </div>
            <p className="text-white font-bold text-lg truncate">{name}</p>
            {deal.value > 0 && <p className="text-emerald-400 text-sm font-semibold mt-0.5">${deal.value.toFixed(0)}</p>}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button onClick={() => setEditing(true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contact actions */}
        {(contact.phone || mapsUrl) && (
          <div className="flex gap-2 mb-4">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-green-600/20 border border-green-600/30 text-green-400 py-2.5 rounded-xl text-sm font-semibold">
                <Phone size={14} /> {contact.phone}
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-indigo-600/20 border border-indigo-600/30 text-indigo-400 py-2.5 px-4 rounded-xl text-sm font-semibold">
                <Navigation size={14} />
              </a>
            )}
          </div>
        )}

        {/* Info */}
        <div className="space-y-3 mb-5">
          {address && (
            <div className="flex items-start gap-2 px-4 py-3 bg-slate-800 rounded-2xl">
              <MapPin size={14} className="text-slate-500 mt-0.5 shrink-0" />
              <p className="text-slate-300 text-sm">{address}</p>
            </div>
          )}
          {services.length > 0 && (
            <div className="px-4 py-3 bg-slate-800 rounded-2xl">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Services</p>
              <div className="flex flex-wrap gap-2">
                {services.map(svc => (
                  <span key={svc} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-900/30 border border-emerald-700/30 text-emerald-300 text-xs font-medium">
                    <Leaf size={11} /> {SVC_MAP[svc] || svc}
                  </span>
                ))}
              </div>
            </div>
          )}
          {deal.notes && (
            <div className="px-4 py-3 bg-slate-800 rounded-2xl">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Notes</p>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{deal.notes}</p>
            </div>
          )}
        </div>

        {/* Pipeline stages */}
        <div className="mb-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Move to stage</p>
          <div className="grid grid-cols-2 gap-2">
            {STAGES.map(st => (
              <button key={st.key} onClick={() => moveToStage(st.key)} disabled={moving || st.key === deal.stage}
                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 ${
                  st.key === deal.stage
                    ? `${st.color} ${st.text} border-transparent ring-2 ring-white/20`
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                } disabled:cursor-default`}>
                {st.key === deal.stage && <Check size={12} />}
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Go to schedule (Construction only) */}
        {deal.stage === 'won' && (
          <button onClick={() => { onClose(); navigate('/calendar') }}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm mb-4">
            <CalendarDays size={16} /> View Construction Schedule
          </button>
        )}

        {/* Delete */}
        <div className="border-t border-slate-800 pt-3">
          {confirmDel ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(false)} className="flex-1 border border-slate-700 text-slate-400 py-2.5 rounded-xl text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-2 text-red-400 py-2.5 rounded-xl text-sm bg-red-500/10">
              <Trash2 size={14} /> Delete Lead
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Deal Card ──────────────────────────────────────────────────────────────────
function DealCard({ deal, onTap }) {
  const contact  = deal.contact || {}
  const name     = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || deal.title
  const services = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)
  const stage    = STAGE_MAP[deal.stage] || STAGE_MAP.lead

  return (
    <button onClick={onTap}
      className="w-full text-left bg-emerald-900/40 border border-emerald-800/50 rounded-2xl p-4 active:bg-emerald-900/60 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-white font-semibold text-sm truncate">{name}</p>
        {deal.value > 0 && (
          <span className="text-emerald-400 text-xs font-bold shrink-0">${deal.value.toFixed(0)}</span>
        )}
      </div>
      {contact.address && (
        <p className="text-slate-500 text-xs truncate mb-2 flex items-center gap-1">
          <MapPin size={10} className="shrink-0" /> {contact.address}
        </p>
      )}
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {services.map(svc => (
            <span key={svc} className="text-[10px] px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/30 rounded-full text-emerald-400">
              {SVC_MAP[svc] || svc}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-slate-600 text-[10px]">{fmt(deal.created_at)}</span>
        <ChevronRight size={14} className="text-slate-600" />
      </div>
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function LandscapePipeline() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [deals, setDeals]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeStage, setActiveStage] = useState('lead')
  const [addForm, setAddForm]       = useState(false)
  const [selected, setSelected]     = useState(null)

  const load = useCallback(() => {
    api.get('/deals/', { params: { limit: 1000, business_type: 'landscape' } })
      .then(r => setDeals(r.data))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const countByStage = Object.fromEntries(STAGES.map(s => [s.key, deals.filter(d => d.stage === s.key).length]))
  const visible = deals.filter(d => d.stage === activeStage)
  const curStage = STAGE_MAP[activeStage] || STAGE_MAP.lead

  return (
    <div className="flex flex-col h-full bg-[#050f0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Leaf size={18} className="text-emerald-400" />
            <h1 className="text-xl font-bold text-slate-100">Landscape Pipeline</h1>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">{deals.length} total leads</p>
        </div>
        {isAdmin && (
          <button onClick={() => setAddForm(true)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={16} /> New Lead
          </button>
        )}
      </div>

      {/* Stage tabs */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto flex-shrink-0 scrollbar-none">
        {STAGES.map(st => (
          <button key={st.key} onClick={() => setActiveStage(st.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
              activeStage === st.key
                ? `${st.color} ${st.text} border-transparent`
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
            {countByStage[st.key] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeStage === st.key ? 'bg-white/20' : 'bg-slate-800'
              }`}>{countByStage[st.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <Leaf size={36} className="mb-3 opacity-30" />
            <p className="text-sm">No leads in {curStage.label}</p>
            {isAdmin && activeStage === 'lead' && (
              <button onClick={() => setAddForm(true)} className="mt-3 text-indigo-400 text-sm font-semibold">
                + Add first lead
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(deal => (
              <DealCard key={deal.id} deal={deal} onTap={() => setSelected(deal)} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {addForm && (
        <LeadForm onSave={() => { setAddForm(false); load() }} onClose={() => setAddForm(false)} />
      )}
      {selected && (
        <DealSheet
          deal={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { load(); setSelected(null) }}
          onDeleted={id => { setDeals(prev => prev.filter(d => d.id !== id)); setSelected(null) }}
        />
      )}
    </div>
  )
}
