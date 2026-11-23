import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Plus, Search, FileText, Loader2 } from 'lucide-react'

export const QUOTE_STATUS = {
  draft:    { label: 'Brouillon', cls: 'bg-slate-700 text-slate-300' },
  sent:     { label: 'Envoyée',   cls: 'bg-blue-900/40 text-blue-400' },
  viewed:   { label: 'Vue',       cls: 'bg-yellow-900/40 text-yellow-400' },
  accepted: { label: 'Acceptée',  cls: 'bg-emerald-900/40 text-emerald-400' },
  declined: { label: 'Refusée',   cls: 'bg-red-900/40 text-red-400' },
  expired:  { label: 'Expirée',   cls: 'bg-slate-700 text-slate-400' },
}

export const money = (cents) =>
  ((cents || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })

const TABS = [
  { key: '', label: 'Toutes' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyées' },
  { key: 'viewed', label: 'Vues' },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'declined', label: 'Refusées' },
]

export function StatusPill({ status }) {
  const s = QUOTE_STATUS[status] || QUOTE_STATUS.draft
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

export default function Quotes() {
  const nav = useNavigate()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      api.get('/quotes', { params: search ? { search } : {} })
        .then(r => setQuotes(r.data))
        .catch(() => setQuotes([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const counts = useMemo(() => {
    const c = { '': quotes.length }
    quotes.forEach(q => { c[q.status] = (c[q.status] || 0) + 1 })
    return c
  }, [quotes])

  const rows = tab ? quotes.filter(q => q.status === tab) : quotes
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-CA') : ''

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileText size={20} className="text-[#5b8eff]" /> Soumissions
        </h1>
        <button onClick={() => nav('/quotes/new')}
          className="flex items-center gap-1.5 bg-[#5b8eff] hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-lg">
          <Plus size={16} /> Nouvelle soumission
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-3 pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === t.key ? 'bg-[#5b8eff] text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}>
            {t.label} <span className="opacity-70">({counts[t.key] || 0})</span>
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (numéro, client, titre)"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5b8eff]" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-500">Aucune soumission.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left border-b border-slate-800">
                <tr><th className="p-3">No</th><th className="p-3">Client</th><th className="p-3">Titre</th>
                  <th className="p-3 text-right">Total</th><th className="p-3">Statut</th><th className="p-3">Date</th></tr>
              </thead>
              <tbody>
                {rows.map(q => (
                  <tr key={q.id} onClick={() => nav(`/quotes/${q.id}`)}
                    className="border-b border-slate-800/60 hover:bg-slate-800/50 cursor-pointer text-slate-300">
                    <td className="p-3 font-medium text-white">{q.number}</td>
                    <td className="p-3">{q.contact_name}</td>
                    <td className="p-3 text-slate-400">{q.title}</td>
                    <td className="p-3 text-right text-white">{money(q.total_cents)}</td>
                    <td className="p-3"><StatusPill status={q.status} /></td>
                    <td className="p-3 text-slate-400">{fmtDate(q.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map(q => (
              <div key={q.id} onClick={() => nav(`/quotes/${q.id}`)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 active:bg-slate-800">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-white font-medium">{q.contact_name}</div>
                    <div className="text-xs text-slate-500">{q.number} · {fmtDate(q.created_at)}</div>
                  </div>
                  <StatusPill status={q.status} />
                </div>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-slate-400 truncate pr-2">{q.title}</span>
                  <span className="text-white font-medium">{money(q.total_cents)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
