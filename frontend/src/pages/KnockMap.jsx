import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Plus, Navigation, X, MapPin, ChevronDown } from 'lucide-react'

// Fix Vite broken Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { key: 'knocked',        label: 'Knocked',        color: '#94a3b8', tw: 'bg-slate-400'   },
  { key: 'not_home',       label: 'Not Home',       color: '#f59e0b', tw: 'bg-amber-400'   },
  { key: 'answered',       label: 'Answered',       color: '#3b82f6', tw: 'bg-blue-500'    },
  { key: 'interested',     label: 'Interested',     color: '#22c55e', tw: 'bg-green-500'   },
  { key: 'not_interested', label: 'Not Interested', color: '#ef4444', tw: 'bg-red-500'     },
]

const EMPTY_FORM = { address: '', status: 'knocked', notes: '', contact_id: '' }

// ─── Icons ────────────────────────────────────────────────────────────────────

function makePin(color, pulse = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:inline-block">
      ${pulse ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${color};opacity:0.25;animation:location-pulse 1.8s ease-out infinite"></div>` : ''}
      <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z"
              fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
  })
}

const locationDotIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:18px;height:18px">
    <div class="location-pulse-ring" style="position:absolute;inset:-5px;border-radius:50%;background:#3b82f6;opacity:0.4"></div>
    <div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:2.5px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.6)"></div>
  </div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
})

const pinIcons = Object.fromEntries(STATUSES.map((s) => [s.key, makePin(s.color)]))

// Client pin — indigo, distinct from knock pins
const clientPinIcon = makePin('#818cf8')

// Booked/scheduled pin — amber, calendar icon
const bookedPinIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;display:inline-block">
    <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z"
            fill="#f59e0b" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/>
      <rect x="9" y="10" width="8" height="6.5" rx="1" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
      <line x1="11" y1="9" x2="11" y2="11" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="15" y1="9" x2="15" y2="11" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="9" y1="13" x2="17" y2="13" stroke="#f59e0b" stroke-width="1.2"/>
    </svg>
  </div>`,
  iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
})

// Done pin — emerald with checkmark
const donePinIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;display:inline-block">
    <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z"
            fill="#10b981" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/>
      <polyline points="9,13 11.5,15.5 17,10" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`,
  iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
})

// ─── Internal Leaflet components ──────────────────────────────────────────────

function MapController({ onReady, placing, onMove }) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map])
  useMapEvents({ move: () => { if (placing) onMove(map.getCenter()) } })
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KnockMap() {
  const { user } = useAuth()
  const [knocks, setKnocks]       = useState([])
  const [contacts, setContacts]   = useState([])
  const [deals, setDeals]         = useState([])
  const [userLoc, setUserLoc]     = useState(null)       // { lat, lng }
  const [locError, setLocError]   = useState(false)

  // pin-placement flow
  const [mode, setMode]           = useState(null)       // null | 'placing' | 'filling'
  const [pendingLL, setPendingLL] = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  // filter drawer
  const [filterStatus, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [synced, setSynced]       = useState(true)
  const mapRef    = useRef(null)
  const watchRef  = useRef(null)

  // ── Data loading ─────────────────────────────────────────────────────────
  const load = useCallback(() => {
    api.get('/knocks/')
      .then((r) => { setKnocks(r.data); setSynced(true) })
      .catch(() => setSynced(false))
  }, [])

  useEffect(() => { load() }, [load])
  const loadContactsDeals = useCallback(() => {
    api.get('/contacts/').then((r) => setContacts(r.data)).catch(() => {})
    api.get('/deals/').then((r) => setDeals(r.data)).catch(() => {})
  }, [])

  useEffect(() => { loadContactsDeals() }, [loadContactsDeals])

  // Poll contacts + deals every 10s so booked pins appear without page refresh
  useEffect(() => {
    const t = setInterval(loadContactsDeals, 10000)
    return () => clearInterval(t)
  }, [loadContactsDeals])

  // Poll every 5 s for real-time sync
  useEffect(() => {
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  // ── User location ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setLocError(true); return }

    // Initial fix → zoom to user at ~10 km radius (zoom 13)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setUserLoc({ lat, lng })
        if (mapRef.current) mapRef.current.setView([lat, lng], 13)
      },
      () => setLocError(true),
      { enableHighAccuracy: true, timeout: 12000 },
    )

    // Keep dot updated
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    )
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────
  function recenter() {
    if (userLoc && mapRef.current) mapRef.current.setView([userLoc.lat, userLoc.lng], 13)
  }

  function startPlacing() {
    setMode('placing')
    setForm(EMPTY_FORM)
  }

  function confirmLocation() {
    const c = mapRef.current ? mapRef.current.getCenter() : userLoc
    setPendingLL({ lat: c.lat, lng: c.lng })
    setMode('filling')
  }

  function dropAtMyLocation() {
    if (!userLoc) return
    setPendingLL({ ...userLoc })
    setForm(EMPTY_FORM)
    setMode('filling')
  }

  function cancel() { setMode(null); setPendingLL(null) }

  async function saveKnock() {
    if (!pendingLL) return
    setSaving(true)
    try {
      await api.post('/knocks/', {
        lat: pendingLL.lat, lng: pendingLL.lng,
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

  // Contacts with a done deal → emerald checkmark pin
  const doneContactIds = new Set(
    deals.filter((d) => d.job_status === 'done').map((d) => d.contact_id)
  )
  // Contacts with an active deal (todo / payment_pending) → amber calendar pin
  const bookedContactIds = new Set(
    deals
      .filter((d) => d.job_status === 'todo' || d.job_status === 'payment_pending')
      .map((d) => d.contact_id)
      .filter((id) => !doneContactIds.has(id)) // done takes priority
  )

  // Only show this user's own pins — use Team Map to see everyone's pins
  const myKnocks = knocks.filter((k) => k.created_by === user?.id)
  const filtered = filterStatus ? myKnocks.filter((k) => k.status === filterStatus) : myKnocks
  const counts   = Object.fromEntries(STATUSES.map((s) => [s.key, myKnocks.filter((k) => k.status === s.key).length]))
  const activeStatus = STATUSES.find((s) => s.key === filterStatus)

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    // Full-screen relative container — map fills everything, UI floats on top
    <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-slate-950">

      {/* ══ MAP ══════════════════════════════════════════════════════════════ */}
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapController
          onReady={(m) => { mapRef.current = m }}
          placing={mode === 'placing'}
          onMove={() => {}}
        />

        {/* User location dot */}
        {userLoc && (
          <Marker position={[userLoc.lat, userLoc.lng]} icon={locationDotIcon} zIndexOffset={1000} />
        )}

        {/* Geocoded client/lead pins — draggable to correct position */}
        {contacts.filter((c) => c.lat && c.lng).map((c) => {
          const isDone   = doneContactIds.has(c.id)
          const isBooked = bookedContactIds.has(c.id)
          const icon = isDone ? donePinIcon : isBooked ? bookedPinIcon : clientPinIcon
          return (
            <Marker
              key={`client-${c.id}`}
              position={[c.lat, c.lng]}
              icon={icon}
              draggable={true}
              zIndexOffset={isDone ? 600 : isBooked ? 500 : 0}
              eventHandlers={{
                dragend: async (e) => {
                  const { lat, lng } = e.target.getLatLng()
                  try {
                    await api.patch(`/contacts/${c.id}/location`, { lat, lng })
                    setContacts(prev => prev.map(x =>
                      x.id === c.id ? { ...x, lat, lng } : x
                    ))
                  } catch { /* silent — pin snaps back on next poll */ }
                },
              }}
            >
              <Popup minWidth={200} className="knock-popup">
                <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                    {c.first_name} {c.last_name || ''}
                  </div>
                  {c.address && (
                    <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{c.address}</div>
                  )}
                  {c.phone && (
                    <div style={{ color: '#6366f1', fontSize: 11, marginTop: 2 }}>📞 {c.phone}</div>
                  )}
                  {c.services && (
                    <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>🔧 {c.services}</div>
                  )}
                  {c.price != null && (
                    <div style={{ color: '#059669', fontSize: 11, marginTop: 2, fontWeight: 600 }}>${c.price.toFixed(2)}</div>
                  )}
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                      background: '#eef2ff', color: '#6366f1',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    }}>{c.status}</span>
                    {isDone && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        background: '#d1fae5', color: '#059669',
                        fontSize: 10, fontWeight: 700,
                      }}>✓ Done</span>
                    )}
                    {isBooked && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        background: '#fef3c7', color: '#d97706',
                        fontSize: 10, fontWeight: 700,
                      }}>📅 Booked</span>
                    )}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 6 }}>
                    ✥ Drag pin to reposition
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Saved knock pins */}
        {filtered.map((k) => (
          <Marker key={k.id} position={[k.lat, k.lng]} icon={pinIcons[k.status] || pinIcons.knocked}>
            <Popup minWidth={220} className="knock-popup">
              <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                {/* Address + delete */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.3 }}>
                      {k.address || `${k.lat.toFixed(4)}, ${k.lng.toFixed(4)}`}
                    </div>
                    {k.contact && (
                      <div style={{ color: '#6366f1', fontSize: 11, marginTop: 2 }}>
                        👤 {k.contact.first_name} {k.contact.last_name}
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteKnock(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 0 0 8px', flexShrink: 0, lineHeight: 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>

                {k.notes && (
                  <div style={{ color: '#475569', fontSize: 12, marginBottom: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                    {k.notes}
                  </div>
                )}

                {/* Status update chips */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                  Change status
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {STATUSES.map((s) => (
                    <button key={s.key} onClick={() => updateStatus(k.id, s.key)} style={{
                      padding: '4px 9px', borderRadius: 20,
                      border: `1.5px solid ${k.status === s.key ? s.color : '#e2e8f0'}`,
                      background: k.status === s.key ? s.color : '#fff',
                      color: k.status === s.key ? '#fff' : '#64748b',
                      fontSize: 11, cursor: 'pointer', fontWeight: 600,
                      transition: 'all 0.15s',
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

      {/* ══ TOP BAR (floating) ════════════════════════════════════════════════ */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="px-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-700/40 flex items-center h-11 px-3 gap-2">
            {/* Fixed title */}
            <MapPin size={13} className="text-indigo-400 flex-shrink-0" />
            <span className="text-white font-bold text-xs flex-shrink-0">My Map</span>
            <div className="w-px h-4 bg-slate-700 flex-shrink-0" />
            {/* Scrollable stats */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0">
              <span className="text-slate-400 text-xs whitespace-nowrap">{myKnocks.length} knocks</span>
              <span className="text-indigo-400 text-xs whitespace-nowrap">{contacts.filter(c=>c.lat&&c.lng).length}/{contacts.length} pins</span>
              {bookedContactIds.size > 0 && <span className="text-amber-400 text-xs font-semibold whitespace-nowrap">📅 {bookedContactIds.size}</span>}
              {doneContactIds.size > 0 && <span className="text-emerald-400 text-xs font-semibold whitespace-nowrap">✓ {doneContactIds.size}</span>}
            </div>
            <div className="w-px h-4 bg-slate-700 flex-shrink-0" />
            {/* Filter button */}
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-1 text-xs font-semibold flex-shrink-0"
              style={{ color: activeStatus ? activeStatus.color : '#94a3b8' }}
            >
              {activeStatus && <span className="w-2 h-2 rounded-full" style={{ background: activeStatus.color }} />}
              {activeStatus ? activeStatus.label : 'All'}
              <ChevronDown size={11} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${synced ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>
        </div>

        {/* Filter dropdown */}
        {filterOpen && (
          <div className="pointer-events-auto mx-4 mt-1 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/40 shadow-2xl overflow-hidden">
            <button
              onClick={() => { setFilter(''); setFilterOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 ${!filterStatus ? 'text-white' : 'text-slate-400'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              All pins
              <span className="ml-auto text-slate-500 text-xs font-bold">{knocks.length}</span>
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => { setFilter(filterStatus === s.key ? '' : s.key); setFilterOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 border-t border-slate-700/30 ${filterStatus === s.key ? 'text-white' : 'text-slate-400'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
                <span className="ml-auto text-slate-500 text-xs font-bold">{counts[s.key]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ STATUS COUNT BAR (floating bottom of top area) ════════════════════ */}
      {!filterOpen && mode === null && (
        <div className="absolute left-0 right-0 z-10 px-4 pointer-events-none" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
          <div className="flex gap-2 overflow-x-auto pb-1 pointer-events-auto" style={{ scrollbarWidth: 'none' }}>
            {STATUSES.filter((s) => counts[s.key] > 0).map((s) => (
              <button
                key={s.key}
                onClick={() => setFilter(filterStatus === s.key ? '' : s.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg transition-all border ${
                  filterStatus === s.key
                    ? 'text-white border-transparent'
                    : 'bg-slate-900/80 backdrop-blur border-slate-700/40 text-slate-300'
                }`}
                style={filterStatus === s.key ? { background: s.color, borderColor: 'transparent' } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: filterStatus === s.key ? 'rgba(255,255,255,0.7)' : s.color }} />
                {s.label}
                <span className="font-bold">{counts[s.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ CROSSHAIR (while placing) ═════════════════════════════════════════ */}
      {mode === 'placing' && (
        <>
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <svg width="56" height="56" viewBox="0 0 56 56" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}>
              <line x1="28" y1="4"  x2="28" y2="20" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/>
              <line x1="28" y1="36" x2="28" y2="52" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/>
              <line x1="4"  y1="28" x2="20" y2="28" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/>
              <line x1="36" y1="28" x2="52" y2="28" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="28" cy="28" r="6" fill="#6366f1" stroke="white" strokeWidth="2.5"/>
            </svg>
          </div>

          {/* Hint */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur text-slate-200 text-xs font-medium px-4 py-2 rounded-full shadow-xl whitespace-nowrap">
              Move map to position, then tap Place Pin
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 flex gap-3"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
            <button onClick={cancel}
              className="flex-shrink-0 px-5 py-4 rounded-2xl text-sm font-semibold bg-slate-900/90 backdrop-blur border border-slate-600 text-slate-300">
              Cancel
            </button>
            <button onClick={confirmLocation}
              className="flex-1 py-4 rounded-2xl text-sm font-bold bg-indigo-600 text-white shadow-2xl">
              📍 Place Pin Here
            </button>
          </div>
        </>
      )}

      {/* ══ LEGEND (bottom-left) ═════════════════════════════════════════════ */}
      {mode === null && (
        <div className="absolute bottom-0 left-0 z-10 p-4">
          <div className="bg-slate-900/85 backdrop-blur-md rounded-2xl px-3 py-2.5 border border-slate-700/40 shadow-xl space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#818cf8"/><circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/></svg>
              <span className="text-slate-300 text-xs">Contact</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#f59e0b"/><circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/></svg>
              <span className="text-amber-400 text-xs">Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#10b981"/><circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/><polyline points="9,13 11.5,15.5 17,10" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-emerald-400 text-xs">Done</span>
            </div>
            {contacts.length === 0 && (
              <div className="text-amber-400 text-xs pt-0.5 border-t border-slate-700/40">Import contacts first</div>
            )}
            {contacts.length > 0 && contacts.filter(c => c.lat && c.lng).length === 0 && (
              <div className="text-amber-400 text-xs pt-0.5 border-t border-slate-700/40">Click "Pin on Map"<br/>in Contacts page</div>
            )}
          </div>
        </div>
      )}

      {/* ══ FLOATING ACTION BUTTONS (bottom-right) ════════════════════════════ */}
      {mode === null && (
        <div className="absolute bottom-0 right-0 z-10 flex flex-col items-end gap-3 p-4">

          {/* Recenter on location */}
          {userLoc && (
            <button
              onClick={recenter}
              className="w-12 h-12 rounded-2xl bg-slate-900/90 backdrop-blur border border-slate-700/50 shadow-xl flex items-center justify-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Navigation size={20} />
            </button>
          )}

          {/* Drop pin at my location */}
          {userLoc && (
            <button
              onClick={dropAtMyLocation}
              className="h-12 px-4 rounded-2xl bg-slate-900/90 backdrop-blur border border-slate-700/50 shadow-xl flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
            >
              <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
              Here
            </button>
          )}

          {/* Main "Add Pin" FAB */}
          <button
            onClick={startPlacing}
            className="h-14 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 shadow-2xl flex items-center gap-2.5 text-white font-bold text-sm transition-colors"
            style={{ boxShadow: '0 4px 24px rgba(99,102,241,0.5)' }}
          >
            <Plus size={20} strokeWidth={2.5} />
            Add Pin
          </button>
        </div>
      )}

      {/* ══ NEW PIN FORM (bottom sheet on mobile / side panel on desktop) ══════ */}
      {mode === 'filling' && (
        <>
          <div className="absolute inset-0 z-30 bg-black/30 md:hidden" onClick={cancel} />

          <div className="absolute z-40 bottom-0 left-0 right-0 rounded-t-3xl md:rounded-3xl md:bottom-6 md:right-6 md:left-auto md:w-88 bg-slate-900 border border-slate-700/60 shadow-2xl">
            {/* Sheet handle (mobile) */}
            <div className="flex justify-center pt-3 pb-0.5 md:hidden">
              <div className="w-9 h-1 rounded-full bg-slate-600/70" />
            </div>

            <div className="px-5 pt-4 pb-6" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 12px), 24px)' }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                    <MapPin size={16} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight">New Pin</p>
                    {pendingLL && (
                      <p className="text-slate-500 text-xs font-mono leading-tight">
                        {pendingLL.lat.toFixed(4)}, {pendingLL.lng.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={cancel} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="123 Main St"
                    className="w-full border border-slate-700 bg-slate-800/80 text-slate-100 placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setForm({ ...form, status: s.key })}
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all"
                        style={{
                          borderColor: form.status === s.key ? s.color : 'rgba(100,116,139,0.3)',
                          background: form.status === s.key ? s.color + '20' : 'rgba(30,41,59,0.5)',
                          color: form.status === s.key ? s.color : '#64748b',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="truncate">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="What happened at this door?"
                    className="w-full border border-slate-700 bg-slate-800/80 text-slate-100 placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Link Contact</label>
                  <select
                    value={form.contact_id}
                    onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                    className="w-full border border-slate-700 bg-slate-800/80 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button onClick={cancel}
                    className="flex-1 border border-slate-700 text-slate-400 py-3.5 rounded-2xl text-sm font-semibold hover:bg-slate-800 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveKnock} disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors"
                    style={{ boxShadow: '0 2px 16px rgba(99,102,241,0.4)' }}>
                    {saving ? 'Saving…' : '📍 Save Pin'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ NO LOCATION WARNING ═══════════════════════════════════════════════ */}
      {locError && mode === null && (
        <div className="absolute bottom-24 left-4 right-4 z-10 pointer-events-none">
          <div className="bg-amber-900/80 backdrop-blur border border-amber-700/50 text-amber-200 text-xs font-medium px-4 py-2.5 rounded-xl text-center shadow-lg">
            Location access denied — enable it in browser settings to use GPS features
          </div>
        </div>
      )}
    </div>
  )
}
