import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../App.jsx'
import { Users } from 'lucide-react'

const API = '/api'

const STATUS_COLORS = {
  knocked: '#6366f1',
  answered: '#3b82f6',
  not_home: '#f59e0b',
  interested: '#22c55e',
  not_interested: '#ef4444',
}

export default function TeamMap() {
  const { token } = useAuth()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [knocks, setKnocks] = useState([])
  const [users, setUsers] = useState([])
  const [filterUser, setFilterUser] = useState('')
  const [loading, setLoading] = useState(true)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    async function load() {
      const [kRes, uRes] = await Promise.all([
        fetch(`${API}/knocks/?limit=2000`, { headers }),
        fetch(`${API}/users/`, { headers }),
      ])
      setKnocks(await kRes.json())
      setUsers(await uRes.json())
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (loading || !mapRef.current) return
    if (typeof window.L === 'undefined') return

    const L = window.L
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([39.5, -98.35], 4)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapInstance.current)
    }

    // Clear existing markers
    mapInstance.current.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) mapInstance.current.removeLayer(layer)
    })

    const filtered = filterUser ? knocks.filter(k => String(k.created_by) === filterUser) : knocks
    filtered.forEach(k => {
      L.circleMarker([k.lat, k.lng], {
        radius: 7,
        fillColor: STATUS_COLORS[k.status] || '#6366f1',
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.85,
      })
        .bindPopup(`<b>${k.status}</b><br>${k.address || ''}<br>${k.notes || ''}`)
        .addTo(mapInstance.current)
    })

    if (filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map(k => [k.lat, k.lng]))
      mapInstance.current.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [knocks, filterUser, loading])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">Team Map</h1>
          <p className="text-slate-400 text-sm">{knocks.length} knocks total</p>
        </div>
        <select className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
          value={filterUser} onChange={e => setFilterUser(e.target.value)}>
          <option value="">All reps</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
        </select>
      </div>

      {/* Leaflet CSS */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" />

      <div ref={mapRef} className="flex-1" style={{ background: '#1e293b' }}>
        {loading && (
          <div className="flex items-center justify-center h-full text-slate-400">
            Loading...
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-slate-800 flex flex-wrap gap-3">
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
            {s.replace('_', ' ')}
          </div>
        ))}
      </div>
    </div>
  )
}
