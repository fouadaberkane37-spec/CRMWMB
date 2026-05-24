import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../App.jsx'
import {
  CalendarDays, Plus, Clock, User, MapPin, X, Wrench,
  AlertCircle, Users, Loader2, Phone, ChevronDown,
} from 'lucide-react'

const API = '/api'

// ── Service types (mirrors backend scheduling.SERVICE_CONFIG) ─────────────────
const SERVICES = [
  { key: 'gutters',     label: 'Nettoyage de gouttières',   techs: 2, duration: 120 },
  { key: 'window-ext',  label: 'Vitres (Extérieur)',         techs: 1, duration:  90 },
  { key: 'window-int',  label: 'Vitres (Intérieur)',         techs: 1, duration:  90 },
  { key: 'window-full', label: 'Vitres (Int. + Ext.)',       techs: 2, duration: 180 },
  { key: 'pressure',    label: 'Lavage haute pression',      techs: 1, duration:  90 },
  { key: 'roof',        label: 'Nettoyage de toiture',       techs: 2, duration: 150 },
  { key: 'screens',     label: 'Nettoyage de moustiquaires', techs: 1, duration:  60 },
  { key: 'solar',       label: 'Panneaux solaires',          techs: 2, duration: 120 },
  { key: 'estimate',    label: 'Estimation',                 techs: 1, duration:  60 },
  { key: 'follow_up',   label: 'Suivi',                      techs: 1, duration:  30 },
  { key: 'service',     label: 'Service général',            techs: 1, duration:  90 },
  { key: 'install',     label: 'Installation',               techs: 2, duration: 120 },
]
const SERVICE_MAP = Object.fromEntries(SERVICES.map(s => [s.key, s]))

const STATUSES = ['todo', 'payment_pending', 'done', 'cancelled']
const STATUS_CFG = {
  todo:            { label: 'À faire',          cls: 'bg-indigo-500/20 text-indigo-300', bar: 'border-l-indigo-500' },
  payment_pending: { label: 'Paiement en attente', cls: 'bg-amber-500/20 text-amber-300',  bar: 'border-l-amber-500'  },
  done:            { label: 'Terminé',          cls: 'bg-green-500/20  text-green-300',  bar: 'border-l-green-500'  },
  cancelled:       { label: 'Annulé',           cls: 'bg-slate-500/20  text-slate-400',  bar: 'border-l-slate-600'  },
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function toDateStr(iso) { return iso ? iso.slice(0, 10) : '' }
function toTimeStr(iso) { return iso ? iso.slice(11, 16) : '' }

// ── Main component ────────────────────────────────────────────────────────────
export default function Booking() {
  const { token } = useAuth()
  const [bookings,     setBookings]     = useState([])
  const [contacts,     setContacts]     = useState([])
  const [techs,        setTechs]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  const [filterStatus, setFilterStatus] = useState('')

  const EMPTY_FORM = {
    title: '', contact_id: '', technician_id: '',
    date: '', time: '',
    duration_minutes: 90, type: 'window-ext',
    status: 'todo', notes: '', address: '',
  }
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading,   setSlotsLoading]   = useState(false)
  const [slotsBlocked,   setSlotsBlocked]   = useState(null)
  const [saveError,      setSaveError]      = useState(null)
  const [saving,         setSaving]         = useState(false)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // ── Load bookings + contacts + techs ────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const url = filterStatus
        ? `${API}/bookings/?status=${filterStatus}`
        : `${API}/bookings/`
      const [bRes, cRes, uRes] = await Promise.all([
        fetch(url,                            { headers }),
        fetch(`${API}/contacts/?limit=500`,   { headers }),
        fetch(`${API}/users/`,                { headers }),
      ])
      const bData = await bRes.json()
      const cData = await cRes.json()
      const uData = await uRes.json()
      setBookings(Array.isArray(bData) ? bData : [])
      setContacts(Array.isArray(cData) ? cData : [])
      setTechs(Array.isArray(uData)
        ? uData.filter(u => u.role === 'technician' || u.role === 'admin')
        : [])
    } catch (err) {
      console.error('load error', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus])

  // ── Fetch available slots ────────────────────────────────────────────────────
  const fetchSlots = useCallback(async (date, type, duration, excludeId) => {
    if (!date || !type) { setAvailableSlots([]); return }
    setSlotsLoading(true)
    setSlotsBlocked(null)
    try {
      const params = new URLSearchParams({ date, type, duration })
      if (excludeId) params.set('exclude_id', excludeId)
      const res  = await fetch(`${API}/bookings/available-slots?${params}`, { headers })
      const data = await res.json()
      setAvailableSlots(data.slots || [])
      setSlotsBlocked(
        (!data.slots || data.slots.length === 0)
          ? (data.blocked_reason || 'Aucun créneau disponible pour cette journée.')
          : null
      )
    } catch {
      setAvailableSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (showForm) fetchSlots(form.date, form.type, form.duration_minutes, editItem?.id)
  }, [form.date, form.type, form.duration_minutes, showForm])

  // ── Open / close form ────────────────────────────────────────────────────────
  function openNew() {
    setEditItem(null)
    const today = new Date().toISOString().slice(0, 10)
    const svc   = SERVICE_MAP['window-ext']
    setForm({ ...EMPTY_FORM, date: today, duration_minutes: svc.duration })
    setSaveError(null)
    setAvailableSlots([])
    setSlotsBlocked(null)
    setShowForm(true)
  }

  function openEdit(b) {
    setEditItem(b)
    const svc = SERVICE_MAP[b.type] || SERVICE_MAP['service']
    setForm({
      title:            b.title        || '',
      contact_id:       b.contact_id   ?? '',
      technician_id:    b.technician_id ?? '',
      date:             toDateStr(b.scheduled_at),
      time:             toTimeStr(b.scheduled_at),
      duration_minutes: b.duration_minutes || svc.duration,
      type:             b.type   || 'service',
      status:           b.status || 'todo',
      notes:            b.notes  || '',
      address:          b.address || '',
    })
    setSaveError(null)
    setAvailableSlots([])
    setSlotsBlocked(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditItem(null)
    setSaveError(null)
    setAvailableSlots([])
    setSlotsBlocked(null)
  }

  function handleTypeChange(type) {
    const svc = SERVICE_MAP[type] || SERVICE_MAP['service']
    setForm(f => ({ ...f, type, duration_minutes: svc.duration }))
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save() {
    setSaveError(null)
    if (!form.title.trim()) { setSaveError('Le titre est requis.'); return }
    if (!form.date)         { setSaveError('La date est requise.'); return }
    if (!form.time)         { setSaveError("L'heure est requise."); return }

    const payload = {
      title:            form.title,
      contact_id:       form.contact_id    ? Number(form.contact_id)    : null,
      technician_id:    form.technician_id ? Number(form.technician_id) : null,
      scheduled_at:     `${form.date}T${form.time}:00`,
      duration_minutes: Number(form.duration_minutes) || 60,
      type:             form.type,
      status:           form.status,
      notes:            form.notes,
      address:          form.address,
    }

    setSaving(true)
    try {
      const url    = editItem ? `${API}/bookings/${editItem.id}` : `${API}/bookings/`
      const method = editItem ? 'PUT' : 'POST'
      const res    = await fetch(url, { method, headers, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.detail || 'Erreur lors de la sauvegarde.')
        return
      }
      closeForm()
      load()
    } catch {
      setSaveError('Erreur réseau. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!confirm('Supprimer ce rendez-vous ?')) return
    await fetch(`${API}/bookings/${id}`, { method: 'DELETE', headers })
    load()
  }

  const svcInfo = SERVICE_MAP[form.type] || SERVICE_MAP['service']

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full bg-slate-950">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-white font-bold text-2xl">Réservations</h1>
            <p className="text-slate-400 text-sm">{bookings.length} rendez-vous</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> Nouveau
          </button>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {['', ...STATUSES].map(s => {
            const cfg = STATUS_CFG[s]
            const count = s ? bookings.filter(b => b.status === s).length : bookings.length
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  filterStatus === s
                    ? cfg ? cfg.cls + ' ring-1 ring-current' : 'bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cfg && <span className="w-2 h-2 rounded-full bg-current opacity-80 shrink-0" />}
                {cfg ? cfg.label : 'Tous'} {count}
              </button>
            )
          })}
        </div>
      </div>

      {/* Booking list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-slate-400 text-center py-16 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> Chargement…
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
            <p>Aucun rendez-vous</p>
            {filterStatus && (
              <button onClick={() => setFilterStatus('')} className="mt-2 text-indigo-400 text-sm underline">
                Voir tous
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => {
              const svc = SERVICE_MAP[b.type]
              const cfg = STATUS_CFG[b.status] || STATUS_CFG.todo
              const contactName = b.contact
                ? `${b.contact.first_name} ${b.contact.last_name || ''}`.trim()
                : null
              return (
                <div
                  key={b.id}
                  onClick={() => openEdit(b)}
                  className={`bg-slate-900 rounded-r-2xl rounded-l-sm border-l-4 ${cfg.bar} border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors`}
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title + status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">{b.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {svc && svc.techs === 2 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 flex items-center gap-1 font-medium">
                              <Users size={9} /> 2 tech
                            </span>
                          )}
                        </div>

                        {/* Service type */}
                        {svc && (
                          <div className="flex items-center gap-1 mt-1 text-slate-400 text-xs">
                            <Wrench size={11} />
                            <span>{svc.label}</span>
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {formatDateTime(b.scheduled_at)}
                            {b.duration_minutes ? ` · ${b.duration_minutes}min` : ''}
                          </span>
                          {contactName && (
                            <span className="flex items-center gap-1">
                              <User size={11} />{contactName}
                            </span>
                          )}
                          {b.contact?.phone && (
                            <a
                              href={`tel:${b.contact.phone}`}
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                            >
                              <Phone size={11} />{b.contact.phone}
                            </a>
                          )}
                          {b.technician && (
                            <span className="flex items-center gap-1">
                              <User size={11} />{b.technician.full_name || b.technician.username}
                            </span>
                          )}
                          {b.address && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} className="shrink-0" />
                              <span className="truncate max-w-[180px]">{b.address}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); remove(b.id) }}
                        className="text-slate-700 hover:text-red-400 p-1 shrink-0 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
          <div
            className="relative bg-slate-900 rounded-t-3xl md:rounded-2xl w-full md:max-w-lg px-5 pt-4 max-h-[94vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            {/* Handle (mobile) */}
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 md:hidden" />

            {/* Form header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">
                {editItem ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
              </h2>
              <button onClick={closeForm} className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">

              {/* Title */}
              <input
                className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                placeholder="Titre du rendez-vous *"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              {/* ── Service type ── */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Type de service
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 pr-10"
                    value={form.type}
                    onChange={e => handleTypeChange(e.target.value)}
                  >
                    {SERVICES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>

                {/* Service badges */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold border ${
                    svcInfo.techs === 2
                      ? 'bg-amber-900/40 text-amber-300 border-amber-700/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    <Users size={11} />
                    {svcInfo.techs === 2 ? '2 techniciens requis' : '1 technicien'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    <Clock size={11} />
                    {svcInfo.duration} min
                  </span>
                </div>
              </div>

              {/* Date + time */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Date &amp; heure
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 text-center"
                    style={{ colorScheme: 'dark' }}
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value, time: '' }))}
                  />
                  <input
                    type="time"
                    className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 text-center"
                    style={{ colorScheme: 'dark' }}
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  />
                </div>
              </div>

              {/* Available slots */}
              {form.date && (
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                    Créneaux disponibles
                    {slotsLoading && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                  </p>
                  {slotsBlocked ? (
                    <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-2xl px-4 py-3">
                      <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-red-300 text-sm">{slotsBlocked}</p>
                    </div>
                  ) : availableSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableSlots.map(slot => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, time: slot }))}
                          className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                            form.time === slot
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : !slotsLoading ? (
                    <p className="text-slate-500 text-sm italic">Sélectionnez une date pour voir les créneaux.</p>
                  ) : null}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Durée (minutes)
                </label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || svcInfo.duration }))}
                />
                <p className="text-slate-600 text-xs mt-1.5 pl-1">
                  Durée par défaut pour ce service : {svcInfo.duration} min
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">Statut</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUSES.map(s => {
                    const c = STATUS_CFG[s]
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, status: s }))}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          form.status === s
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          form.status === s ? 'bg-white' : 'bg-current opacity-60'
                        }`} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Contact */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">Contact</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 pr-10"
                    value={form.contact_id}
                    onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                  >
                    <option value="">— Aucun contact —</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name || ''}{c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Technician */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Technicien assigné
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 pr-10"
                    value={form.technician_id}
                    onChange={e => setForm(f => ({ ...f, technician_id: e.target.value }))}
                  >
                    <option value="">— Aucun technicien —</option>
                    {techs.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Address */}
              <input
                className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                placeholder="Adresse du client"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />

              {/* Notes */}
              <textarea
                className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3.5 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none placeholder-slate-500"
                rows={3}
                placeholder="Notes (optionnel)"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />

              {/* Save error */}
              {saveError && (
                <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-2xl px-4 py-3">
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{saveError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeForm}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3.5 rounded-2xl text-sm font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving || !!slotsBlocked}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Sauvegarde…' : editItem ? 'Enregistrer' : 'Créer le rendez-vous'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
