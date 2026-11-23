import React, { useState, useEffect } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Plus, Trash2, Save, ArrowUp, ArrowDown, BookOpen, Loader2 } from 'lucide-react'

const CATEGORIES = [
  ['windows', 'Vitres'], ['gutters', 'Gouttières'], ['washing', 'Lavage'], ['pavers', 'Pavés'], ['other', 'Autre'],
]

const input = 'bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#5b8eff]'

export default function PriceBook() {
  const { user } = useAuth() || {}
  const isAdmin = user && (user.role === 'admin' || user.role === 'ceo')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState({})
  const [err, setErr] = useState('')

  const load = () => api.get('/services').then(r => { setRows(r.data); setDirty({}) })
    .catch(() => setErr('Chargement impossible')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const edit = (id, patch) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    setDirty(d => ({ ...d, [id]: true }))
  }

  const save = async (r) => {
    try {
      await api.put(`/services/${r.id}`, {
        name: r.name, name_en: r.name_en, category: r.category, description: r.description,
        unit_price_cents: Math.round((parseFloat(r._price ?? r.unit_price_cents / 100) || 0) * 100),
        default_minutes: r.default_minutes ? Number(r.default_minutes) : null,
        taxable: r.taxable, active: r.active,
      })
      await load()
    } catch { setErr('Sauvegarde impossible (admin requis)') }
  }

  const add = async () => {
    try { await api.post('/services', { name: 'Nouveau service', unit_price_cents: 0 }); await load() }
    catch { setErr('Création impossible (admin requis)') }
  }

  const remove = async (r) => {
    if (!window.confirm(`Désactiver « ${r.name} » ?`)) return
    await api.delete(`/services/${r.id}`).catch(() => setErr('Suppression impossible'))
    load()
  }

  const move = async (idx, dir) => {
    const next = [...rows]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setRows(next)
    await api.post('/services/reorder', { ids: next.map(r => r.id) }).catch(() => setErr('Réorganisation impossible'))
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <BookOpen size={20} className="text-[#5b8eff]" /> Liste de prix
        </h1>
        {isAdmin && (
          <button onClick={add} className="flex items-center gap-1.5 bg-[#5b8eff] hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> Ajouter
          </button>
        )}
      </div>
      {err && <div className="mb-3 text-sm text-red-400">{err}</div>}
      {loading ? <div className="flex justify-center py-12 text-slate-500"><Loader2 className="animate-spin" /></div> : (
        <div className="space-y-2">
          {rows.map((r, idx) => (
            <div key={r.id} className={`bg-slate-900 border border-slate-800 rounded-xl p-3 grid gap-2 md:grid-cols-12 items-center ${r.active ? '' : 'opacity-50'}`}>
              <input disabled={!isAdmin} className={`${input} md:col-span-3`} value={r.name} onChange={e => edit(r.id, { name: e.target.value })} placeholder="Nom (FR)" />
              <input disabled={!isAdmin} className={`${input} md:col-span-2`} value={r.name_en || ''} onChange={e => edit(r.id, { name_en: e.target.value })} placeholder="Name (EN)" />
              <select disabled={!isAdmin} className={`${input} md:col-span-1`} value={r.category || 'other'} onChange={e => edit(r.id, { category: e.target.value })}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="md:col-span-1 flex items-center gap-1">
                <span className="text-slate-500 text-sm">$</span>
                <input disabled={!isAdmin} type="number" step="0.01" min="0" className={`${input} w-full`}
                  value={r._price ?? (r.unit_price_cents / 100)} onChange={e => edit(r.id, { _price: e.target.value })} />
              </div>
              <input disabled={!isAdmin} type="number" min="0" className={`${input} md:col-span-1`} value={r.default_minutes || ''} onChange={e => edit(r.id, { default_minutes: e.target.value })} placeholder="min" />
              <label className="md:col-span-1 text-xs text-slate-400 flex items-center gap-1">
                <input disabled={!isAdmin} type="checkbox" checked={r.taxable} onChange={e => edit(r.id, { taxable: e.target.checked })} /> Taxable
              </label>
              <label className="md:col-span-1 text-xs text-slate-400 flex items-center gap-1">
                <input disabled={!isAdmin} type="checkbox" checked={r.active} onChange={e => edit(r.id, { active: e.target.checked })} /> Actif
              </label>
              {isAdmin && (
                <div className="md:col-span-2 flex justify-end gap-1">
                  <button onClick={() => move(idx, -1)} className="p-1.5 text-slate-400 hover:text-white"><ArrowUp size={16} /></button>
                  <button onClick={() => move(idx, 1)} className="p-1.5 text-slate-400 hover:text-white"><ArrowDown size={16} /></button>
                  <button disabled={!dirty[r.id]} onClick={() => save(r)} className="p-1.5 text-[#5b8eff] disabled:text-slate-600"><Save size={16} /></button>
                  <button onClick={() => remove(r)} className="p-1.5 text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
