import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FileText } from 'lucide-react'
import api from '../api.js'

const fmt = (cents) =>
  ((cents || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-CA') : '—')

const TABS = [
  ['all', 'Toutes'],
  ['draft', 'Brouillon'],
  ['sent', 'Envoyées'],
  ['viewed', 'Vues'],
  ['overdue', 'En retard'],
  ['partial', 'Partielles'],
  ['paid', 'Payées'],
]

export const STATUS_STYLE = {
  draft: ['Brouillon', 'bg-slate-700 text-slate-200'],
  sent: ['Envoyée', 'bg-blue-500/20 text-blue-300'],
  viewed: ['Vue', 'bg-indigo-500/20 text-indigo-300'],
  partial: ['Partielle', 'bg-amber-500/20 text-amber-300'],
  paid: ['Payée', 'bg-emerald-500/20 text-emerald-300'],
  cancelled: ['Annulée', 'bg-slate-700 text-slate-400'],
  refunded: ['Remboursée', 'bg-slate-700 text-slate-400'],
  overdue: ['En retard', 'bg-red-500/20 text-red-300'],
}

export function StatusPill({ inv }) {
  const key = inv.overdue ? 'overdue' : inv.status
  const [label, cls] = STATUS_STYLE[key] || [key, 'bg-slate-700 text-slate-200']
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>{label}</span>
}

function Tile({ label, value, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  )
}

export default function Invoices() {
  const nav = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, s] = await Promise.all([
        api.get('/billing/invoices', { params: { status: tab, search: search || undefined } }),
        api.get('/billing/summary'),
      ])
      setRows(l.data)
      setSummary(s.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const counts = summary?.counts || {}
  const tabs = useMemo(() => TABS, [])

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText size={22} /> Factures</h1>
        <button onClick={() => nav('/invoices/new')}
          className="flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-slate-950" style={{ background: '#5b8eff' }}>
          <Plus size={16} /> Nouvelle facture
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Tile label="À recevoir" value={fmt(summary?.outstanding_cents)} color="#5b8eff" />
        <Tile label="En retard" value={fmt(summary?.overdue_cents)} color="#f87171" />
        <Tile label="Payé ce mois-ci" value={fmt(summary?.paid_this_month_cents)} color="#34d399" />
      </div>

      <div className="flex gap-1 overflow-x-auto mb-3 pb-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border ${tab === k ? 'border-[#5b8eff] bg-[#5b8eff]/15 text-white' : 'border-slate-800 bg-slate-900 text-slate-400'}`}>
            {label} <span className="opacity-60">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un numéro ou un client…"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-[#5b8eff]" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[90px_1fr_100px_100px_110px_110px_100px] gap-2 px-4 py-2 text-xs text-slate-500 border-b border-slate-800">
          <div>Numéro</div><div>Client</div><div>Date</div><div>Échéance</div>
          <div className="text-right">Total</div><div className="text-right">Solde</div><div>Statut</div>
        </div>
        {loading && rows.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Chargement…</div>}
        {!loading && rows.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Aucune facture</div>}
        {rows.map((r) => (
          <button key={r.id} onClick={() => nav(`/invoices/${r.id}`)}
            className="w-full text-left grid grid-cols-2 md:grid-cols-[90px_1fr_100px_100px_110px_110px_100px] gap-2 px-4 py-3 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 items-center text-sm">
            <div className="font-semibold" style={{ color: '#5b8eff' }}>{r.number}</div>
            <div className="truncate text-right md:text-left">{r.contact_name}</div>
            <div className="text-slate-400">{fmtDate(r.issue_date)}</div>
            <div className="text-slate-400 text-right md:text-left">{fmtDate(r.due_date)}</div>
            <div className="md:text-right">{fmt(r.total_cents)}</div>
            <div className={`text-right ${r.balance_cents > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{fmt(r.balance_cents)}</div>
            <div className="text-right md:text-left"><StatusPill inv={r} /></div>
          </button>
        ))}
      </div>
    </div>
  )
}
