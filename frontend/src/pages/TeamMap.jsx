import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api.js'
import { Users, MapPin, ChevronDown } from 'lucide-react'

// ─── User color palette ───────────────────────────────────────────────────────
const USER_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#84cc16', // lime
]

function getUserColor(userId, userOrder) {
  const idx = userOrder.indexOf(userId)
  return USER_COLORS[(idx === -1 ? 0 : idx) % USER_COLORS.length]
}

// ─── Pin icon ─────────────────────────────────────────────────────────────────
function makePin(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z"
            fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/>
    </svg>`,
    iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
  })
}

// ─── Status label map ─────────────────────────────────────────────────────────
const STATUS_LABELS = {
  knocked: 'Knocked',
  not_home: 'Not Home',
  answered: 'Answered',
  interested: 'Interested',
  not_interested: 'Not Interested',
}

function MapReady({ onReady }) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map])
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeamMap() {
  const [knocks, setKnocks] = useState([])
  const [teamUsers, setTeamUsers] = useState([]) // [{ id, username, full_name }]
  const [synced, setSynced] = useState(true)
  const [filterUserId, setFilterUserId] = useState(null) // null = all
  const [filterOpen, setFilterOpen] = useState(false)
  const mapRef = useRef(null)

  // Sorted list of user IDs in the order they appear — determines color assignment
  const userOrder = teamUsers.map((u) => u.id)

  // Precompute icons by user ID
  const pinIconCache = useRef({})
  function getPinIcon(userId) {
    if (!pinIconCache.current[userId]) {
      pinIconCache.current[userId] = makePin(getUserColor(userId, userOrder))
    }
    return pinIconCache.current[userId]
  }

  const load = useCallback(() => {
    api.get('/knocks/')
      .then((r) => { setKnocks(r.data); setSynced(true) })
      .catch(() => setSynced(false))
  }, [])

  useEffect(() => {
    load()
    api.get('/users/team').then((r) => setTeamUsers(r.data)).catch(() => {})
  }, [load])

  // Poll every 8s for real-time sync
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const filtered = filterUserId ? knocks.filter((k) => k.created_by === filterUserId) : knocks

  const activeUser = filterUserId ? teamUsers.find((u) => u.id === filterUserId) : null
  const activeColor = activeUser ? getUserColor(activeUser.id, userOrder) : null

  // Counts per user
  const countsByUser = {}
  knocks.forEach((k) => {
    countsByUser[k.created_by] = (countsByUser[k.created_by] || 0) + 1
  })

  function userName(u) {
    return u.full_name || u.username
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* ══ MAP ══════════════════════════════════════════════════════════════ */}
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapReady onReady={(m) => { mapRef.current = m }} />

        {filtered.map((k) => (
          <Marker key={k.id} position={[k.lat, k.lng]} icon={getPinIcon(k.created_by)}>
            <Popup minWidth={200}>
              <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                  {k.address || `${k.lat.toFixed(4)}, ${k.lng.toFixed(4)}`}
                </div>
                {k.contact && (
                  <div style={{ color: '#6366f1', fontSize: 11, marginBottom: 4 }}>
                    👤 {k.contact.first_name} {k.contact.last_name}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    background: getUserColor(k.created_by, userOrder),
                  }} />
                  <span style={{ fontSize: 11, color: '#475569' }}>
                    {teamUsers.find((u) => u.id === k.created_by)
                      ? userName(teamUsers.find((u) => u.id === k.created_by))
                      : `User #${k.created_by}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {STATUS_LABELS[k.status] || k.status}
                </div>
                {k.notes && (
                  <div style={{ marginTop: 6, padding: '5px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#475569' }}>
                    {k.notes}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {/* Title */}
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl border border-slate-700/40">
            <Users size={16} className="text-indigo-400 flex-shrink-0" />
            <span className="text-white font-bold text-sm">Team Map</span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-slate-400 text-xs">{knocks.length} pins</span>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${synced ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>

          {/* Filter by agent */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="pointer-events-auto bg-slate-900/85 backdrop-blur-md rounded-2xl px-3.5 py-2.5 flex items-center gap-2 shadow-xl border border-slate-700/40 text-sm font-medium transition-colors"
            style={{ color: activeColor || '#94a3b8' }}
          >
            {activeUser
              ? <>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: activeColor }} />
                  {userName(activeUser)}
                </>
              : 'All agents'}
            <ChevronDown size={14} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter dropdown */}
        {filterOpen && (
          <div className="pointer-events-auto mx-4 mt-1 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/40 shadow-2xl overflow-hidden">
            <button
              onClick={() => { setFilterUserId(null); setFilterOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 ${!filterUserId ? 'text-white' : 'text-slate-400'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              All agents
              <span className="ml-auto text-slate-500 text-xs font-bold">{knocks.length}</span>
            </button>
            {teamUsers.map((u) => {
              const color = getUserColor(u.id, userOrder)
              return (
                <button
                  key={u.id}
                  onClick={() => { setFilterUserId(filterUserId === u.id ? null : u.id); setFilterOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 border-t border-slate-700/30 ${filterUserId === u.id ? 'text-white' : 'text-slate-400'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {userName(u)}
                  <span className="ml-auto text-slate-500 text-xs font-bold">{countsByUser[u.id] || 0}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ LEGEND (bottom-left) ════════════════════════════════════════════ */}
      {teamUsers.length > 0 && (
        <div className="absolute bottom-0 left-0 z-10 p-4"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <div className="bg-slate-900/85 backdrop-blur-md rounded-2xl border border-slate-700/40 shadow-xl px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Agents</p>
            {teamUsers.map((u) => {
              const color = getUserColor(u.id, userOrder)
              return (
                <button
                  key={u.id}
                  onClick={() => setFilterUserId(filterUserId === u.id ? null : u.id)}
                  className={`flex items-center gap-2 text-xs w-full text-left rounded-lg px-1 py-0.5 transition-colors ${
                    filterUserId === u.id ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="truncate max-w-[120px]">{userName(u)}</span>
                  <span className="ml-auto text-slate-600 font-bold">{countsByUser[u.id] || 0}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Read-only notice */}
      <div className="absolute bottom-0 right-0 z-10 p-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="bg-slate-900/70 backdrop-blur-sm rounded-xl border border-slate-700/30 px-3 py-1.5">
          <p className="text-slate-500 text-xs">View only</p>
        </div>
      </div>
    </div>
  )
}
