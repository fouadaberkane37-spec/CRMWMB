import React, { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api.js'
import { LifecyclePill } from './Customers.jsx'
import { PlanForm, EMPTY_PLAN, PLAN_STATUS } from './ServicePlans.jsx'
import { Phone, MessageSquare, Plus, Pencil, Trash2, Star, ArrowLeft } from 'lucide-react'

const TABS = [['overview', 'Aperçu'], ['properties', 'Propriétés'], ['jobs', 'Jobs'], ['quotes', 'Soumissions'], ['invoices', 'Factures'], ['plans', 'Plans'], ['messages', 'Messages']]
const money = (n) => (n || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const cents = (c) => money((c || 0) / 100)
const fmt = (s) => (s ? new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const fmtD = (s) => (s ? new Date(s).toLocaleDateString('fr-CA', { dateStyle: 'medium' }) : 'Non planifié')
const inp = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100'
const card = 'bg-slate-900 border border-slate-800 rounded-xl'
const JOB = { todo: 'À faire', payment_pending: 'Paiement en attente', done: 'Terminé', cancelled: 'Annulé' }

function Empty({ children }) { return <div className="text-center text-slate-500 text-sm p-6">{children}</div> }

function Properties({ id, items, reload }) {
  const [edit, setEdit] = useState(null)
  async function save() {
    const body = { label: edit.label, address: edit.address, city: edit.city, postal_code: edit.postal_code, notes: edit.notes, is_primary: !!edit.is_primary }
    if (edit.id) await api.put(`/customers/properties/${edit.id}`, body)
    else await api.post(`/customers/${id}/properties`, body)
    setEdit(null); reload()
  }
  async function del(p) { if (window.confirm('Supprimer cette propriété ?')) { await api.delete(`/customers/properties/${p.id}`); reload() } }
  return (
    <div className="space-y-3">
      <button onClick={() => setEdit({ label: '', address: '', city: '', postal_code: '', notes: '' })} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-[#5b8eff] text-white"><Plus size={15} /> Ajouter</button>
      {edit && (
        <div className={`${card} p-4 space-y-2`}>
          <input className={inp} placeholder="Étiquette (Maison, Chalet…)" value={edit.label || ''} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
          <input className={inp} placeholder="Adresse" value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Ville" value={edit.city || ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
            <input className={inp} placeholder="Code postal" value={edit.postal_code || ''} onChange={(e) => setEdit({ ...edit, postal_code: e.target.value })} />
          </div>
          <textarea className={inp} rows={2} placeholder="Notes (nb. fenêtres, étages, accès…)" value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!edit.is_primary} onChange={(e) => setEdit({ ...edit, is_primary: e.target.checked })} /> Principale</label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEdit(null)} className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300">Annuler</button>
            <button onClick={save} disabled={!edit.address} className="px-3 py-1.5 text-sm rounded-lg bg-[#5b8eff] text-white disabled:opacity-50">Enregistrer</button>
          </div>
        </div>
      )}
      {items.length === 0 && <Empty>Aucune propriété</Empty>}
      {items.map((p) => (
        <div key={p.id} className={`${card} p-4 flex items-start gap-3`}>
          <div className="flex-1 min-w-0">
            <div className="text-slate-100 font-medium flex items-center gap-2">{p.label || 'Propriété'} {p.is_primary && <Star size={14} className="text-[#ffd166]" fill="currentColor" />}</div>
            <div className="text-sm text-slate-400">{p.address}{p.city ? `, ${p.city}` : ''} {p.postal_code}</div>
            {p.notes && <div className="text-xs text-slate-500 mt-1">{p.notes}</div>}
          </div>
          <button onClick={() => setEdit(p)} className="p-1.5 rounded bg-slate-800 text-slate-300"><Pencil size={14} /></button>
          <button onClick={() => del(p)} className="p-1.5 rounded bg-slate-800 text-red-400"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [planModal, setPlanModal] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.get(`/customers/${id}/overview`).then((r) => setData(r.data)).catch(() => setError('Client introuvable'))
  }, [id])
  useEffect(() => { load() }, [load])

  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!data) return <div className="p-6 text-slate-500">Chargement…</div>
  const { contact: c, stats } = data

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link to="/customers" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3"><ArrowLeft size={14} /> Clients</Link>
      <div className={`${card} p-4 mb-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-100">{c.name}</h1>
          <LifecyclePill value={data.lifecycle} />
          <div className="flex gap-1 flex-wrap">{c.tags.map((t) => <span key={t} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{t}</span>)}</div>
        </div>
        <div className="text-sm text-slate-400 mt-1">{c.phone || 'Pas de téléphone'}{c.email ? ` · ${c.email}` : ''}{c.address ? ` · ${c.address}` : ''}</div>
        <div className="flex gap-2 mt-3">
          {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-700 text-white"><Phone size={14} /> Appeler</a>}
          {c.phone && <Link to="/chats" className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-[#5b8eff] text-white"><MessageSquare size={14} /> SMS</Link>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-slate-800">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-[#5b8eff] text-[#5b8eff]' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Valeur à vie', money(stats.lifetime_value), 'text-[#ffd166]'], ['Solde dû', cents(stats.balance_due_cents), stats.balance_due_cents > 0 ? 'text-red-400' : 'text-slate-100'],
            ['Jobs', stats.job_count, 'text-slate-100'], ['Soumissions', stats.quote_count, 'text-slate-100']].map(([l, v, cls]) => (
            <div key={l} className={`${card} p-4`}><div className="text-xs text-slate-500 uppercase">{l}</div><div className={`text-2xl font-bold ${cls}`}>{v}</div></div>
          ))}
          {c.notes && <div className={`${card} p-4 col-span-2 md:col-span-4 text-sm text-slate-300 whitespace-pre-wrap`}>{c.notes}</div>}
        </div>
      )}

      {tab === 'properties' && <Properties id={id} items={data.properties} reload={load} />}

      {tab === 'jobs' && (
        <div className="space-y-2">
          {data.jobs.length === 0 && <Empty>Aucun job</Empty>}
          {data.jobs.map((j) => (
            <Link key={j.id} to="/calendar" className={`${card} p-3 flex items-center gap-3 hover:bg-slate-800/50`}>
              <div className="flex-1 min-w-0"><div className="text-slate-100 truncate">{j.title}</div><div className="text-xs text-slate-500">{fmtD(j.date)}</div></div>
              <span className="text-xs text-slate-400">{JOB[j.job_status] || j.job_status}</span>
              <span className="text-sm text-[#ffd166]">{money(j.value)}</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-2">
          <Link to={`/quotes/new?contact=${c.id}`} className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-[#5b8eff] text-white"><Plus size={15} /> Nouvelle soumission</Link>
          {data.quotes.length === 0 && <Empty>Aucune soumission</Empty>}
          {data.quotes.map((q) => (
            <Link key={q.id} to={`/quotes/${q.id}`} className={`${card} p-3 flex items-center gap-3 hover:bg-slate-800/50`}>
              <div className="flex-1"><div className="text-slate-100">{q.number} {q.title && <span className="text-slate-500">· {q.title}</span>}</div></div>
              <span className="text-xs text-slate-400">{q.status}</span><span className="text-sm text-[#ffd166]">{cents(q.total_cents)}</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="space-y-2">
          {data.invoices.length === 0 && <Empty>Aucune facture</Empty>}
          {data.invoices.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`} className={`${card} p-3 flex items-center gap-3 hover:bg-slate-800/50`}>
              <div className="flex-1 text-slate-100">{i.number}</div>
              <span className="text-xs text-slate-400">{i.status}</span>
              <span className="text-sm text-[#ffd166]">{cents(i.total_cents)}</span>
              {i.total_cents > i.paid_cents && !['draft', 'cancelled'].includes(i.status) && <span className="text-xs text-red-400">dû {cents(i.total_cents - i.paid_cents)}</span>}
            </Link>
          ))}
        </div>
      )}

      {tab === 'plans' && (
        <div className="space-y-2">
          <button onClick={() => setPlanModal(true)} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-[#5b8eff] text-white"><Plus size={15} /> Créer un plan</button>
          {data.plans.length === 0 && <Empty>Aucun plan</Empty>}
          {data.plans.map((p) => {
            const [label, cls] = PLAN_STATUS[p.status] || PLAN_STATUS.draft
            return (
              <Link key={p.id} to="/service-plans" className={`${card} p-3 flex items-center gap-3 hover:bg-slate-800/50`}>
                <div className="flex-1 text-slate-100">{p.name} <span className="text-xs text-slate-500">· {p.visits_per_year}/an</span></div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span><span className="text-sm text-[#ffd166]">{cents(p.price_cents)}</span>
              </Link>
            )
          })}
        </div>
      )}

      {tab === 'messages' && (
        <div className="space-y-2">
          <Link to="/chats" className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-slate-800 text-slate-200"><MessageSquare size={15} /> Ouvrir les conversations</Link>
          {data.messages.length === 0 && <Empty>Aucun message</Empty>}
          {data.messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === 'inbound' ? 'bg-slate-800 text-slate-100' : 'bg-[#5b8eff]/80 text-white ml-auto'}`}>
              {m.body}<div className="text-[10px] opacity-60 mt-1">{fmt(m.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {planModal && <PlanForm initial={EMPTY_PLAN} fixedContact={c.id} onClose={() => setPlanModal(false)} onSaved={() => { setPlanModal(false); load() }} />}
    </div>
  )
}
