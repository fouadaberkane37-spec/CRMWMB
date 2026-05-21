import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../App.jsx'
import {
  CalendarDays, Plus, Clock, User, MapPin, X, Wrench,
  AlertCircle, Users, ChevronDown, Loader2
} from 'lucide-react'

const API = '/api'

// ── Service types ─────────────────────────────────────────────────────────────
// Mirrors backend scheduling.SERVICE_CONFIG
const SERVICES = [
  { key: 'gutters',     label: 'Nettoyage de gouttières',      techs: 2, duration: 120 },
  { key: 'window-ext',  label: 'Vitres (Extérieur)',            techs: 1, duration:  90 },
  { key: 'window-int',  label: 'Vitres (Intérieur)',            techs: 1, duration:  90 },
  { key: 'window-full', label: 'Vitres (Int. + Ext.)',          techs: 2, duration: 180 },
  { key: 'pressure',    label: 'Lavage haute pression',         techs: 1, duration:  90 },
  { key: 'roof',        label: 'Nettoyage de toiture',          techs: 2, duration: 150 },
  { key: 'screens',     label: 'Nettoyage de moustiquaires',    techs: 1, duration:  60 },
  { key: 'solar',       label: 'Panneaux solaires',             techs: 2, duration: 120 },
  { key: 'estimate',    label: 'Estimation',                    techs: 1, duration:  60 },
  { key: 'follow_up',   label: 'Suivi',                         techs: 1, duration:  30 },
  // legacy
  { key: 'service',     label: 'Service général',               techs: 1, duration:  90 },
  { key: 'install',     label: 'Installation',                  techs: 2, duration: 120 },
]

const SERVICE_MAP = Object.fromEntries(SERVICES.map(s => [s.key, s]))

const STATUSES = ['todo', 'payment_pending', 'done', 'cancelled']
const STATUS_COLORS = {
  todo:            'bg-indigo-500/20 text-indigo-300',
  payment_pending: 'bg-amber-500/20  text-amber-300',
  done:            'bg-green-500/20  text-green-300',
  cancelled:       'bg-slate-500/20  text-slate-400',
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function toDateStr(isoStr) {
  // Returns YYYY-MM-DD from an ISO datetime string without timezone conversion
  return isoStr ? isoStr.slice(0, 10) : ''
}
function toTimeStr(isoStr) {
  return isoStr ? isoStr.slice(11, 16) : ''
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Booking() {
  const { token, user } = useAuth()
  const [bookings,     setBookings]     = useState([])
  const [contacts,     setContacts]     = useState([])
  const [techs,        setTechs]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  const [filterStatus, setFilterStatus] = useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const EMPTY_FORM = {
    title: '', contact_id: '', technician_id: '',
    date: '', time: '',
    duration_minutes: 90, type: 'window-ext',
    status: 'todo', notes: '', address: '',
  }
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading,   setSlotsLoading]   = useState(false)
  const [slotsBlocked,   setSlotsBlocked]   = useState(null) // error string or null
  const [saveError,      setSaveError]      = useState(null)
  const [saving,         setSaving]         = useState(false)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // ── Load data ───────────────────────────────────────────────────────────────
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

  // ── Fetch available slots ───────────────────────────────────────────────────
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
      setSlotsBlocked(data.slots?.length === 0 ? (data.blocked_reason || 'Aucun créneau disponible.') : null)
    } catch {
      setAvailableSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (showForm) {
      fetchSlots(form.date, form.type, form.duration_minutes, editItem?.id)
    }
  }, [form.date, form.type, form.duration_minutes, showForm])

  // ── Open form ───────────────────────────────────────────────────────────────
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
      title:            b.title,
      contact_id:       b.contact_id    || '',
      technician_id:    b.technician_id || '',
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

  function handleTypeChange(type) {
    const svc = SERVICE_MAP[type] || SERVICE_MAP['service']
    setForm(f => ({ ...f, type, duration_minutes: svc.duration }))
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function save() {
    setSaveError(null)
    if (!form.title.trim()) { setSaveError('Le titre est requis.'); return }
    if (!form.date)         { setSaveError('La date est requise.'); return }
    if (!form.time)         { setSaveError('L\'heure est requise.'); return }

    const scheduled_at = `${form.date}T${form.time}:00`
    const payload = {
      title:            form.title,
      contact_id:       form.contact_id    || null,
      technician_id:    form.technician_id || null,
      scheduled_at,
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
      setShowForm(false)
      load()
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Réservations</h1>
          <p className="text-slate-400 text-sm">{bookings.length} rendez-vous</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nouveau
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        {['', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {s ? s.replace('_', ' ') : 'Tous'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Chargement…</div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucun rendez-vous</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => {
            const svc = SERVICE_MAP[b.type]
            return (
              <div
                key={b.id}
                onClick={() => openEdit(b)}
                className="bg-slate-900 rounded-xl p-4 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{b.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || 'bg-slate-700 text-slate-300'}`}>
                        {(b.status || '').replace('_', ' ')}
                      </span>
                      {svc && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 flex items-center gap-1">
                          <Wrench size={10} />{svc.label}
                        </span>
                      )}
                      {svc && (
                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          svc.techs === 2 ? 'bg-amber-900/40 text-amber-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Users size={10} />{svc.techs} tech
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />{formatDateTime(b.scheduled_at)} · {b.duration_minutes}min
                      </span>
                      {b.contact && (
                        <span className="flex items-center gap-1">
                          <User size={12} />{b.contact.first_name} {b.contact.last_name}
                        </span>
                      )}
                      {b.technician && (
                        <span className="flex items-center gap-1">
                          <User size={12} />{b.technician.full_name || b.technician.username}
                        </span>
                      )}
                      {b.address && (
                        <span className="flex items-center gap-1"><MapPin size={12} />{b.address}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); remove(b.id) }}
                    className="text-slate-600 hover:text-red-400 p-1 shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg px-5 pt-5 pb-6 max-h-[92vh] overflow-y-auto">
            {/* Handle */}
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 md:hidden" />
            <h2 className="text-white font-semibold text-lg mb-4">
              {editItem ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <input
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Titre du rendez-vous"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              {/* Service type */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 block">
                  Type de service
                </label>
                <select
                  className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.type}
                  onChange={e => handleTypeChange(e.target.value)}
                >
                  {SERVICES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {/* Service info badge */}
                <div className="mt-2 flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${
                    svcInfo.techs === 2
                      ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    <Users size={11} />
                    {svcInfo.techs === 2 ? '2 techniciens requis' : '1 technicien'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    <Clock size={11} />
                    {svcInfo.duration} min par défaut
                  </span>
                </div>
              </div>

              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 block">Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                    style={{ colorScheme: 'dark' }}
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value, time: '' }))}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 block">Heure</label>
                  <input
                    type="time"
                    className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                    style={{ colorScheme: 'dark' }}
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  />
                </div>
              </div>

              {/* Available slots */}
              {form.date && (
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
                    Créneaux disponibles
                    {slotsLoading && <Loader2 size={11} className="inline ml-2 animate-spin" />}
                  </p>
                  {slotsBlocked ? (
                    <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3">
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
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                            form.time === slot
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : !slotsLoading ? (
                    <p className="text-slate-500 text-sm">Sélectionnez une date pour voir les créneaux.</p>
                  ) : null}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 block">
                  Durée (minutes)
                </label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || svcInfo.duration }))}
                />
                <p className="text-slate-500 text-xs mt-1">
                  Durée par défaut pour ce service : {svcInfo.duration} min
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 block">Statut</label>
                <select
                  className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Contact */}
              <select
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.contact_id}
                onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
              >
                <option value="">Aucun contact</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>

              {/* Technician */}
              <select
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                value={form.technician_id}
                onChange={e => setForm(f => ({ ...f, technician_id: e.target.value }))}
              >
                <option value="">Aucun technicien</option>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                ))}
              </select>

              {/* Address */}
              <input
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500"
                placeholder="Adresse"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />

              {/* Notes */}
              <textarea
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
                rows={3}
                placeholder="Notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />

              {/* Constraint / save error */}
              {saveError && (
                <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3">
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{saveError}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={save}
                disabled={saving || !!slotsBlocked}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
