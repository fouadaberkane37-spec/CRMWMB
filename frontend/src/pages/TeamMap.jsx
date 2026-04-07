import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api.js'
import { Users, ChevronDown } from 'lucide-react'

// ─── User color palette ───────────────────────────────────────────────────────
const USER_COLORS = [
  '#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4',
  '#a855f7','#f97316','#ec4899','#14b8a6','#84cc16',
]

function getUserColor(userId, userOrder) {
  const idx = userOrder.indexOf(userId)
  return USER_COLORS[(idx === -1 ? 0 : idx) % USER_COLORS.length]
}

// ─── Pin icons ────────────────────────────────────────────────────────────────
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

// Contact pins — identical to Personal Map
const clientPinIcon = makePin('#818cf8')

const bookedPinIcon = L.divIcon({
  className: '',
  html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#f59e0b" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/>
    <rect x="9" y="10" width="8" height="6.5" rx="1" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
    <line x1="11" y1="9" x2="11" y2="11" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15" y1="9" x2="15" y2="11" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9" y1="13" x2="17" y2="13" stroke="#f59e0b" stroke-width="1.2"/>
  </svg>`,
  iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
})

const donePinIcon = L.divIcon({
  className: '',
  html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#10b981" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/>
    <polyline points="9,13 11.5,15.5 17,10" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -38],
})

const STATUS_LABELS = {
  knocked: 'Knocked', not_home: 'Not Home', answered: 'Answered',
  interested: 'Interested', not_interested: 'Not Interested',
}

function MapReady({ onReady }) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map])
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeamMap() {
  const [knocks, setKnocks]     = useState([])
  const [contacts, setContacts] = useState([])
  const [deals, setDeals]       = useState([])
  const [teamUsers, setTeamUsers] = useState([])
  const [synced, setSynced]     = useState(true)
  const [filterUserId, setFilterUserId] = useState(null)
  const [filterOpen, setFilterOpen]     = useState(false)
  const mapRef = useRef(null)

  const userOrder = teamUsers.map((u) => u.id)

  const pinIconCache = useRef({})
  function getPinIcon(userId) {
    if (!pinIconCache.current[userId]) {
      pinIconCache.current[userId] = makePin(getUserColor(userId, userOrder))
    }
    return pinIconCache.current[userId]
  }

  const loadAll = useCallback(() => {
    api.get('/knocks/')
      .then((r) => { setKnocks(r.data); setSynced(true) })
      .catch(() => setSynced(false))
    api.get('/contacts/').then((r) => setContacts(r.data)).catch(() => {})
    api.get('/deals/').then((r) => setDeals(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadAll()
    api.get('/users/team').then((r) => setTeamUsers(r.data)).catch(() => {})
  }, [loadAll])

  // Poll every 8s — stays in sync with Personal Map
  useEffect(() => {
    const t = setInterval(loadAll, 8000)
    return () => clearInterval(t)
  }, [loadAll])

  // Same deal-status logic as Personal Map
  const doneContactIds = new Set(
    deals.filter((d) => d.job_status === 'done').map((d) => d.contact_id)
  )
  const bookedContactIds = new Set(
    deals
      .filter((d) => d.job_status === 'todo' || d.job_status === 'payment_pending')
      .map((d) => d.contact_id)
      .filter((id) => !doneContactIds.has(id))
  )

  const filtered         = filterUserId ? knocks.filter((k) => k.created_by === filterUserId) : knocks
  const geocodedContacts = contacts.filter((c) => c.lat && c.lng)
  const activeUser       = filterUserId ? teamUsers.find((u) => u.id === filterUserId) : null
  const activeColor      = activeUser ? getUserColor(activeUser.id, userOrder) : null

  const countsByUser = {}
  knocks.forEach((k) => { countsByUser[k.created_by] = (countsByUser[k.created_by] || 0) + 1 })

  function userName(u) { return u.full_name || u.username }

  return (
    <div
      className="relative w-full overflow-hidden bg-slate-950 md:h-full"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 56px)' }}
    >

      {/* ══ MAP ══════════════════════════════════════════════════════════════ */}
      <MapContainer center={[39.5, -98.35]} zoom={4}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false} attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapReady onReady={(m) => { mapRef.current = m }} />

        {/* Contact / lead pins — same icons & logic as Personal Map */}
        {geocodedContacts.map((c) => {
          const isDone   = doneContactIds.has(c.id)
          const isBooked = bookedContactIds.has(c.id)
          const icon = isDone ? donePinIcon : isBooked ? bookedPinIcon : clientPinIcon
          return (
            <Marker key={`contact-${c.id}`} position={[c.lat, c.lng]} icon={icon}
              zIndexOffset={isDone ? 600 : isBooked ? 500 : 0}>
              <Popup minWidth={200}>
                <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                    {c.first_name} {c.last_name || ''}
                  </div>
                  {c.address  && <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{c.address}</div>}
                  {c.phone    && <div style={{ color: '#6366f1', fontSize: 11, marginTop: 2 }}>📞 {c.phone}</div>}
                  {c.services && <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>🔧 {c.services}</div>}
                  {c.price != null && <div style={{ color: '#059669', fontSize: 11, marginTop: 2, fontWeight: 600 }}>${c.price.toFixed(2)}</div>}
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, background: '#eef2ff', color: '#6366f1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span>
                    {isDone   && <span style={{ padding: '2px 8px', borderRadius: 12, background: '#d1fae5', color: '#059669', fontSize: 10, fontWeight: 700 }}>✓ Done</span>}
                    {isBooked && <span style={{ padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#d97706', fontSize: 10, fontWeight: 700 }}>📅 Booked</span>}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Knock pins — colored by agent */}
        {filtered.map((k) => (
          <Marker key={k.id} position={[k.lat, k.lng]} icon={getPinIcon(k.created_by)}>
            <Popup minWidth={200}>
              <div style={{ fontFamily: 'system-ui,sans-serif', padding: '2px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                  {k.address || `${k.lat.toFixed(4)}, ${k.lng.toFixed(4)}`}
                </div>
                {k.contact && <div style={{ color: '#6366f1', fontSize: 11, marginBottom: 4 }}>👤 {k.contact.first_name} {k.contact.last_name}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: getUserColor(k.created_by, userOrder), display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: '#475569' }}>
                    {teamUsers.find((u) => u.id === k.created_by)
                      ? userName(teamUsers.find((u) => u.id === k.created_by))
                      : `User #${k.created_by}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{STATUS_LABELS[k.status] || k.status}</div>
                {k.notes && <div style={{ marginTop: 6, padding: '5px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#475569' }}>{k.notes}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl border border-slate-700/40">
            <Users size={16} className="text-indigo-400 flex-shrink-0" />
            <span className="text-white font-bold text-sm">Team Map</span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-slate-400 text-xs">{knocks.length} knocks</span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-indigo-400 text-xs">{geocodedContacts.length} contacts</span>
            {doneContactIds.size > 0 && <><span className="text-slate-500 text-xs">·</span><span className="text-emerald-400 text-xs font-semibold">✓ {doneContactIds.size} done</span></>}
            {bookedContactIds.size > 0 && <><span className="text-slate-500 text-xs">·</span><span className="text-amber-400 text-xs font-semibold">📅 {bookedContactIds.size} booked</span></>}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${synced ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>

          <button onClick={() => setFilterOpen((v) => !v)}
            className="pointer-events-auto bg-slate-900/85 backdrop-blur-md rounded-2xl px-3.5 py-2.5 flex items-center gap-2 shadow-xl border border-slate-700/40 text-sm font-medium transition-colors"
            style={{ color: activeColor || '#94a3b8' }}>
            {activeUser
              ? <><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: activeColor }} />{userName(activeUser)}</>
              : 'All agents'}
            <ChevronDown size={14} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {filterOpen && (
          <div className="pointer-events-auto mx-4 mt-1 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/40 shadow-2xl overflow-hidden">
            <button onClick={() => { setFilterUserId(null); setFilterOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 ${!filterUserId ? 'text-white' : 'text-slate-400'}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />All agents
              <span className="ml-auto text-slate-500 text-xs font-bold">{knocks.length}</span>
            </button>
            {teamUsers.map((u) => {
              const color = getUserColor(u.id, userOrder)
              return (
                <button key={u.id}
                  onClick={() => { setFilterUserId(filterUserId === u.id ? null : u.id); setFilterOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-slate-800 border-t border-slate-700/30 ${filterUserId === u.id ? 'text-white' : 'text-slate-400'}`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {userName(u)}
                  <span className="ml-auto text-slate-500 text-xs font-bold">{countsByUser[u.id] || 0}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ LEGEND ══════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-0 left-0 z-10 p-4" style={{ paddingBottom: '16px' }}>
        <div className="bg-slate-900/85 backdrop-blur-md rounded-2xl border border-slate-700/40 shadow-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <svg width="10" height="14" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#818cf8"/><circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/></svg>
            <span className="text-slate-400 text-xs">Contact</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="10" height="14" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#f59e0b"/><circle cx="13" cy="13" r="4.5" fill="white" opacity="0.9"/></svg>
            <span className="text-amber-400 text-xs">Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="10" height="14" viewBox="0 0 26 36"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.67 13 23 13 23S26 21.67 26 13C26 5.82 20.18 0 13 0z" fill="#10b981"/><circle cx="13" cy="13" r="6" fill="white" opacity="0.95"/><polyline points="9,13 11.5,15.5 17,10" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="text-emerald-400 text-xs">Done</span>
          </div>
          {teamUsers.length > 0 && (
            <div className="border-t border-slate-700/40 pt-1.5 mt-0.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Agents</p>
              {teamUsers.map((u) => {
                const color = getUserColor(u.id, userOrder)
                return (
                  <button key={u.id}
                    onClick={() => setFilterUserId(filterUserId === u.id ? null : u.id)}
                    className={`flex items-center gap-2 text-xs w-full text-left rounded-lg px-1 py-0.5 transition-colors ${filterUserId === u.id ? 'text-white' : 'text-slate-400 hover:text-white'}`}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="truncate max-w-[100px]">{userName(u)}</span>
                    <span className="ml-auto text-slate-600 font-bold">{countsByUser[u.id] || 0}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 right-0 z-10 p-4" style={{ paddingBottom: '16px' }}>
        <div className="bg-slate-900/70 backdrop-blur-sm rounded-xl border border-slate-700/30 px-3 py-1.5">
          <p className="text-slate-500 text-xs">View only · syncs every 8s</p>
        </div>
      </div>
    </div>
  )
}
