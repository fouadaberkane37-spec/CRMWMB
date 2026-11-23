import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Search, Phone, ChevronLeft, ChevronRight } from 'lucide-react'

export const LIFECYCLE = {
  new:         { label: 'Nouveau',      cls: 'bg-blue-900/40 text-blue-400' },
  upcoming:    { label: 'À venir',      cls: 'bg-yellow-900/40 text-yellow-400' },
  active_plan: { label: 'Plan actif',   cls: 'bg-emerald-900/40 text-emerald-400' },
  past:        { label: 'Passé',        cls: 'bg-slate-700 text-slate-400' },
}

const TABS = [
  { key: '', label: 'Tous' },
  { key: 'new', label: 'Nouveaux' },
  { key: 'upcoming', label: 'À venir' },
  { key: 'active_plan', label: 'Plan actif' },
  { key: 'past', label: 'Passés' },
]
const PAGE = 50

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const money = (n) => (n || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export function LifecyclePill({ value }) {
  const l = LIFECYCLE[value] || LIFECYCLE.new
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${l.cls}`}>{l.label}</span>
}

export default function Customers() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [totalAll, setTotalAll] = useState(0)
  const [tab, setTab] = useState('')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: PAGE, offset }
    if (tab) params.lifecycle = tab
    if (search) params.search = search
    if (tag) params.tag = tag
    api.get('/customers/', { params }).then((r) => {
      setRows(r.data.customers); setCounts(r.data.counts); setTotal(r.data.total); setTotalAll(r.data.total_all)
    }).finally(() => setLoading(false))
  }, [tab, search, tag, offset])

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])
  useEffect(() => { setOffset(0) }, [tab, search, tag])

  const countFor = (k) => (k ? counts[k] : totalAll)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-4">Clients</h1>

      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-slate-800">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? 'border-[#5b8eff] text-[#5b8eff]' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t.label} <span className="text-xs opacity-70">{countFor(t.key) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher nom, téléphone, adresse…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100" />
        </div>
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Étiquette"
          className="sm:w-44 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_1fr] gap-3 px-4 py-2 text-xs uppercase text-slate-500 border-b border-slate-800">
          <div>Nom</div><div>Téléphone</div><div>Ville</div><div>Statut</div><div>Prochain job</div><div className="text-right">Valeur</div>
        </div>
        {loading && rows.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Chargement…</div>}
        {!loading && rows.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Aucun client</div>}
        {rows.map((c) => (
          <Link key={c.id} to={`/customers/${c.id}`}
            className="grid grid-cols-2 md:grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_1fr] gap-x-3 gap-y-1 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/50 items-center">
            <div className="text-slate-100 font-medium truncate">{c.name}</div>
            <div className="text-slate-400 text-sm flex items-center gap-1 justify-end md:justify-start"><Phone size={12} />{c.phone || '—'}</div>
            <div className="text-slate-400 text-sm truncate">{c.city || '—'}</div>
            <div className="justify-self-end md:justify-self-start"><LifecyclePill value={c.lifecycle} /></div>
            <div className="text-slate-400 text-sm">{fmtDate(c.next_job)}</div>
            <div className="text-[#ffd166] text-sm md:text-right justify-self-end md:justify-self-stretch">{money(c.total_spent)}</div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-slate-400">
        <span>{total} client{total > 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="p-1.5 rounded bg-slate-800 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="p-1.5 rounded bg-slate-800 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}
