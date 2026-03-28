import React, { useState, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api.js'
import { MapPin, Trash2, X } from 'lucide-react'

// Fix default marker icons broken by Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUSES = [
  { key: 'knocked',        label: 'Knocked',        color: '#94a3b8', bg: 'bg-slate-500' },
  { key: 'not_home',       label: 'Not Home',        color: '#f59e0b', bg: 'bg-amber-500' },
  { key: 'answered',       label: 'Answered',        color: '#3b82f6', bg: 'bg-blue-500' },
  { key: 'interested',     label: 'Interested',      color: '#22c55e', bg: 'bg-green-500' },
  { key: 'not_interested', label: 'Not Interested',  color: '#ef4444', bg: 'bg-red-500' },
]

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24s14-14.67 14-24C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
    </svg>`,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -38],
  })
}

const icons = Object.fromEntries(STATUSES.map((s) => [s.key, makeIcon(s.color)]))

function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) })
  return null
}

export default function KnockMap() {
  const [knocks, setKnocks] = useState([])
  const [contacts, setContacts] = useState([])
  const [pending, setPending] = useState(null) // { lat, lng }
  const [form, setForm] = useState({ address: '', status: 'knocked', notes: '', contact_id: '' })
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(() => {
    api.get('/knocks/').then((r) => setKnocks(r.data))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/contacts/').then((r) => setContacts(r.data)) }, [])

  function handleMapClick(latlng) {
    setPending(latlng)
    setForm({ address: '', status: 'knocked', notes: '', contact_id: '' })
  }

  async function saveKnock() {
    setSaving(true)
    try {
      await api.post('/knocks/', {
        lat: pending.lat,
        lng: pending.lng,
        address: form.address || null,
        status: form.status,
        notes: form.notes || null,
        contact_id: form.contact_id ? parseInt(form.contact_id) : null,
      })
      setPending(null)
      load()
    } finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    await api.patch(`/knocks/${id}`, { status })
    load()
  }

  async function deleteKnock(id) {
    await api.delete(`/knocks/${id}`)
    load()
  }

  const filtered = filterStatus ? knocks.filter((k) => k.status === filterStatus) : knocks

  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, knocks.filter((k) => k.status === s.key).length]))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Knock Map</h1>
          <p className="text-slate-500 text-sm mt-0.5">Click anywhere on the map to pin a house</p>
        </div>
        {/* Stats bar */}
        <div className="flex gap-3">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(filterStatus === s.key ? '' : s.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filterStatus === s.key
                  ? 'border-slate-500 bg-slate-700 text-slate-100'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.bg}`} />
              {s.label}
              <span className="ml-0.5 text-slate-500">{counts[s.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative px-8 pb-8">
        <div className="h-full rounded-xl overflow-hidden border border-slate-700/50">
          <MapContainer
            center={[39.5, -98.35]}
            zoom={4}
            style={{ height: '100%', width: '100%', background: '#0f172a' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <ClickHandler onMapClick={handleMapClick} />

            {filtered.map((k) => (
              <Marker key={k.id} position={[k.lat, k.lng]} icon={icons[k.status] || icons.knocked}>
                <Popup minWidth={220} className="dark-popup">
                  <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 200 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ color: '#e2e8f0', fontSize: 13 }}>{k.address || `${k.lat.toFixed(5)}, ${k.lng.toFixed(5)}`}</strong>
                      <button onClick={() => deleteKnock(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                    {k.notes && <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>{k.notes}</p>}
                    {k.contact && <p style={{ color: '#818cf8', fontSize: 12, marginBottom: 8 }}>Contact: {k.contact.first_name} {k.contact.last_name}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {STATUSES.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => updateStatus(k.id, s.key)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 12,
                            border: `1px solid ${k.status === s.key ? s.color : '#334155'}`,
                            background: k.status === s.key ? s.color + '30' : 'transparent',
                            color: k.status === s.key ? s.color : '#64748b',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: k.status === s.key ? 600 : 400,
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* New pin panel */}
        {pending && (
          <div className="absolute top-4 right-12 z-[1000] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 w-72">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-indigo-400" />
                <span className="text-slate-100 font-semibold text-sm">New Pin</span>
              </div>
              <button onClick={() => setPending(null)} className="text-slate-500 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St"
                  className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setForm({ ...form, status: s.key })}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                      style={{
                        borderColor: form.status === s.key ? s.color : '#334155',
                        background: form.status === s.key ? s.color + '25' : 'transparent',
                        color: form.status === s.key ? s.color : '#64748b',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any notes..."
                  className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Link Contact</label>
                <select
                  value={form.contact_id}
                  onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                  className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setPending(null)} className="flex-1 border border-slate-600 text-slate-400 py-2 rounded-lg text-sm hover:bg-slate-800">
                  Cancel
                </button>
                <button onClick={saveKnock} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Saving…' : 'Pin it'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
