import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api.js'
import { MapPin, X, Plus, Navigation, Wifi, WifiOff } from 'lucide-react'

// Fix Vite broken default icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUSES = [
  { key: 'knocked',        label: 'Knocked',        color: '#94a3b8', bg: 'bg-slate-500'  },
  { key: 'not_home',       label: 'Not Home',       color: '#f59e0b', bg: 'bg-amber-500'  },
  { key: 'answered',       label: 'Answered',       color: '#3b82f6', bg: 'bg-blue-500'   },
  { key: 'interested',     label: 'Interested',     color: '#22c55e', bg: 'bg-green-500'  },
  { key: 'not_interested', label: 'Not Interested', color: '#ef4444', bg: 'bg-red-500'    },
]

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24s14-14.67 14-24C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
    </svg>`,
    iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -40],
  })
}

const icons = Object.fromEntries(STATUSES.map((s) => [s.key, makeIcon(s.color)]))

// Exposes map instance + tracks center while placing
function MapController({ onReady, placing, onCenterChange }) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map, onReady])

  useMapEvents({
    move: () => {
      if (placing) onCenterChange(map.getCenter())
    },
  })
  return null
}

const EMPTY_FORM = { address: '', status: 'knocked', notes: '', contact_id: '' }

export default function KnockMap() {
  const [knocks, setKnocks]       = useState([])
  const [contacts, setContacts]   = useState([])
  // mode: null | 'placing' | 'filling'
  const [mode, setMode]           = useState(null)
  const [crosshair, setCrosshair] = useState(null)   // live map center while placing
  const [pendingLL, setPendingLL] = useState(null)   // confirmed lat/lng when filling
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [filterStatus, setFilter] = useState('')
  const [synced, setSynced]       = useState(true)
  const mapRef = useRef(null)
  const pollRef = useRef(null)

  const load = useCallback(() => {
    api.get('/knocks/')
      .then((r) => { setKnocks(r.data); setSynced(true) })
      .catch(() => setSynced(false))
  }, [])

  // Initial load
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/contacts/').then((r) => setContacts(r.data)).catch(() => {}) }, [])

  // Poll every 5 seconds for real-time sync across users
  useEffect(() => {
    pollRef.current = setInterval(load, 5000)
    return () => clearInterval(pollRef.current)
  }, [load])

  // ── Pin placement ──────────────────────────────────────────────
  function startPlacing() {
    const center = mapRef.current ? mapRef.current.getCenter() : { lat: 39.5, lng: -98.35 }
    setCrosshair(center)
    setMode('placing')
    setForm(EMPTY_FORM)
  }

  function confirmLocation() {
    const ll = mapRef.current ? mapRef.current.getCenter() : crosshair
    setPendingLL({ lat: ll.lat, lng: ll.lng })
    setMode('filling')
  }

  function cancel() {
    setMode(null)
    setCrosshair(null)
    setPendingLL(null)
  }

  // Drop pin at device GPS location
  function useMyLocation() {
    if (!navigator.geolocation) return alert('Geolocation not supported by your browser')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        if (mapRef.current) mapRef.current.setView([lat, lng], 17)
        setPendingLL({ lat, lng })
        setMode('filling')
        setForm(EMPTY_FORM)
      },
      () => alert('Could not get your location — check browser permissions'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function saveKnock() {
    if (!pendingLL) return
    setSaving(true)
    try {
      await api.post('/knocks/', {
        lat: pendingLL.lat,
        lng: pendingLL.lng,
        address: form.address || null,
        status: form.status,
        notes: form.notes || null,
        contact_id: form.contact_id ? parseInt(form.contact_id) : null,
      })
      cancel()
      load()
    } finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    await api.patch(`/knocks/${id}`, { status })
    load()
  }

  async function deleteKnock(id) {
    if (!window.confirm('Delete this pin?')) return
    await api.delete(`/knocks/${id}`)
    load()
  }

  const filtered = filterStatus ? knocks.filter((k) => k.status === filterStatus) : knocks
  const counts   = Object.fromEntries(STATUSES.map((s) => [s.key, knocks.filter((k) => k.status === s.key).length]))

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-4 md:px-8 py-3 flex-shrink-0 border-b border-slate-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">

          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2">
                Knock Map
                {/* Live sync indicator */}
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${synced ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                  {synced ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {synced ? 'Live' : 'Offline'}
                </span>
              </h1>
              <p className="text-slate-500 text-xs">{knocks.length} pins · syncs every 5s</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={useMyLocation}
              disabled={mode !== null}
              title="Drop pin at my current location"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 transition-colors"
            >
              <Navigation size={14} />
              <span className="hidden sm:inline">My Location</span>
            </button>
            <button
              onClick={startPlacing}
              disabled={mode !== null}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
            >
              <Plus size={15} />
              Add Pin
            </button>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(filterStatus === s.key ? '' : s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                filterStatus === s.key
                  ? 'border-slate-500 bg-slate-700 text-slate-100'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.bg}`} />
              {s.label}
              <span className="font-bold">{counts[s.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Map + overlays ── */}
      <div className="flex-1 relative">

        {/* Crosshair overlay (shown while placing) */}
        {mode === 'placing' && (
          <>
            {/* Crosshair SVG pinned to absolute center */}
            <div className="absolute inset-0 flex items-center justify-center z-[900] pointer-events-none">
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                {/* Crosshair lines */}
                <line x1="24" y1="4"  x2="24" y2="18" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="24" y1="30" x2="24" y2="44" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="4"  y1="24" x2="18" y2="24" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="30" y1="24" x2="44" y2="24" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="5" fill="#6366f1" stroke="white" strokeWidth="2"/>
              </svg>
            </div>

            {/* "Place Here" bar at the bottom */}
            <div className="absolute bottom-4 left-4 right-4 z-[1000] flex gap-2">
              <button
                onClick={cancel}
                className="flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium border border-slate-600 bg-slate-900/95 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmLocation}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white shadow-xl"
              >
                📍 Place Pin Here
              </button>
            </div>

            {/* Instruction hint */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="bg-slate-900/90 backdrop-blur text-slate-200 text-xs font-medium px-4 py-2 rounded-full shadow-xl whitespace-nowrap">
                Move the map to position the pin, then tap Place Pin Here
              </div>
            </div>
          </>
        )}

        {/* ── Map ── */}
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapController
            onReady={(m) => { mapRef.current = m }}
            placing={mode === 'placing'}
            onCenterChange={setCrosshair}
          />

          {/* Saved pins */}
          {filtered.map((k) => (
            <Marker key={k.id} position={[k.lat, k.lng]} icon={icons[k.status] || icons.knocked}>
              <Popup minWidth={220}>
                <div style={{ fontFamily: 'system-ui,sans-serif', padding: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ color: '#1e293b', fontSize: 13 }}>
                      {k.address || `${k.lat.toFixed(4)}, ${k.lng.toFixed(4)}`}
                    </strong>
                    <button onClick={() => deleteKnock(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 0 0 6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                  {k.notes && <p style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{k.notes}</p>}
                  {k.contact && <p style={{ color: '#6366f1', fontSize: 12, marginBottom: 6 }}>👤 {k.contact.first_name} {k.contact.last_name}</p>}
                  <p style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Update status</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {STATUSES.map((s) => (
                      <button key={s.key} onClick={() => updateStatus(k.id, s.key)} style={{
                        padding: '3px 8px', borderRadius: 12,
                        border: `1px solid ${k.status === s.key ? s.color : '#cbd5e1'}`,
                        background: k.status === s.key ? s.color : 'transparent',
                        color: k.status === s.key ? '#fff' : '#64748b',
                        fontSize: 11, cursor: 'pointer', fontWeight: k.status === s.key ? 600 : 400,
                      }}>
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

      {/* ── New Pin Form — bottom sheet on mobile, panel on desktop ── */}
      {mode === 'filling' && (
        <>
          {/* backdrop on mobile */}
          <div className="fixed inset-0 z-[1050] bg-black/40 md:hidden" onClick={cancel} />

          <div className="
            fixed z-[1100]
            bottom-0 left-0 right-0 rounded-t-2xl
            md:bottom-auto md:top-20 md:right-8 md:left-auto md:w-80 md:rounded-xl
            bg-slate-900 border border-slate-700 shadow-2xl
          ">
            {/* handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            <div className="px-5 pb-6 pt-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <MapPin size={14} className="text-white" />
                  </div>
                  <span className="text-slate-100 font-semibold">New Pin</span>
                </div>
                <button onClick={cancel} className="text-slate-500 hover:text-slate-200 p-1">
                  <X size={18} />
                </button>
              </div>

              {pendingLL && (
                <div className="text-xs text-slate-500 font-mono bg-slate-800 rounded-lg px-3 py-1.5 mb-4">
                  📍 {pendingLL.lat.toFixed(5)}, {pendingLL.lng.toFixed(5)}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="123 Main St"
                    className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setForm({ ...form, status: s.key })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all"
                        style={{
                          borderColor: form.status === s.key ? s.color : '#334155',
                          background:  form.status === s.key ? s.color + '25' : 'transparent',
                          color:       form.status === s.key ? s.color : '#64748b',
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
                    placeholder="Anything to remember..."
                    className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Link Contact</label>
                  <select
                    value={form.contact_id}
                    onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                    className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={cancel} className="flex-1 border border-slate-600 text-slate-400 py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveKnock}
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : '📍 Save Pin'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
