import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Pencil, Trash2, Link as LinkIcon, Play, XCircle, Send } from 'lucide-react'

export const PLAN_STATUS = {
  draft: ['Brouillon', 'bg-slate-700 text-slate-300'],
  sent: ['Envoyé', 'bg-blue-900/40 text-blue-400'],
  active: ['Actif', 'bg-emerald-900/40 text-emerald-400'],
  past_due: ['En retard', 'bg-red-900/40 text-red-400'],
  cancelled: ['Annulé', 'bg-slate-700 text-slate-500'],
  expired: ['Expiré', 'bg-slate-700 text-slate-500'],
}
const FREQ = { per_visit: 'par visite', monthly: 'par mois', yearly: 'par an' }
const TABS = [['', 'Tous'], ['draft', 'Brouillons'], ['sent', 'Envoyés'], ['active', 'Actifs'], ['past_due', 'En retard'], ['cancelled', 'Annulés']]
const money = (c) => ((c || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const toDateInput = (s) => (s ? s.slice(0, 10) : '')
const EMPTY = { contact_id: '', name: '', included_services: '', visits_per_year: 2, price: '', billing_frequency: 'yearly', start_date: '', end_date: '', until_cancelled: true, terms: '' }
const inp = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100'

export function PlanForm({ initial, fixedContact, onSaved, onClose }) {
  const [form, setForm] = useState(initial)
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!fixedContact) api.get('/customers/', { params: { limit: 500 } }).then((r) => setContacts(r.data.customers))
  }, [fixedContact])

  async function save() {
    setErr('')
    const contact_id = fixedContact || parseInt(form.contact_id)
    if (!contact_id || !form.name) { setErr('Client et nom requis'); return }
    setSaving(true)
    const payload = {
      contact_id, name: form.name, included_services: form.included_services,
      visits_per_year: parseInt(form.visits_per_year) || 1,
      price_cents: Math.round(parseFloat(form.price || 0) * 100),
      billing_frequency: form.billing_frequency, terms: form.terms,
      start_date: form.start_date ? `${form.start_date}T00:00:00` : null,
      end_date: !form.until_cancelled && form.end_date ? `${form.end_date}T00:00:00` : null,
    }
    try {
      if (form.id) await api.put(`/service-plans/${form.id}`, payload)
      else await api.post('/service-plans/', payload)
      onSaved()
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  return (
    <Modal title={form.id ? 'Modifier le plan' : 'Nouveau plan de service'} onClose={onClose} size="lg">
      <div className="p-6 space-y-3 overflow-y-auto">
        {!fixedContact && (
          <select value={form.contact_id} onChange={(e) => set('contact_id', e.target.value)} className={inp} disabled={!!form.id}>
            <option value="">Client…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input className={inp} placeholder="Nom du plan (ex: Vitres 2x/an)" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <textarea className={inp} rows={2} placeholder="Services inclus" value={form.included_services} onChange={(e) => set('included_services', e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-400">Visites / an
            <input type="number" min="1" className={inp} value={form.visits_per_year} onChange={(e) => set('visits_per_year', e.target.value)} /></label>
          <label className="text-xs text-slate-400">Prix ($)
            <input type="number" min="0" step="0.01" className={inp} value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label className="text-xs text-slate-400">Facturation
            <select className={inp} value={form.billing_frequency} onChange={(e) => set('billing_frequency', e.target.value)}>
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">Début
            <input type="date" className={inp} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></label>
          <label className="text-xs text-slate-400">Fin
            <input type="date" className={inp} disabled={form.until_cancelled} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.until_cancelled} onChange={(e) => set('until_cancelled', e.target.checked)} /> Jusqu'à annulation
        </label>
        <textarea className={inp} rows={4} placeholder="Conditions" value={form.terms} onChange={(e) => set('terms', e.target.value)} />
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-slate-300">Annuler</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-[#5b8eff] text-white disabled:opacity-50">{saving ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  )
}

export const planToForm = (p) => ({
  id: p.id, contact_id: p.contact_id, name: p.name, included_services: p.included_services || '',
  visits_per_year: p.visits_per_year, price: (p.price_cents || 0) / 100, billing_frequency: p.billing_frequency,
  start_date: toDateInput(p.start_date), end_date: toDateInput(p.end_date), until_cancelled: !p.end_date, terms: p.terms || '',
})
export { EMPTY as EMPTY_PLAN }

export default function ServicePlans() {
  const [data, setData] = useState({ plans: [], counts: {}, total: 0, arr_cents: 0 })
  const [tab, setTab] = useState('')
  const [modal, setModal] = useState(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    api.get('/service-plans/', { params: tab ? { status: tab } : {} }).then((r) => setData(r.data))
  }, [tab])
  useEffect(() => { load() }, [load])

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function copyLink(p) {
    const url = `${window.location.origin}/p/${p.token}`
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Lien du plan', url) }
    if (p.status === 'draft') await api.post(`/service-plans/${p.id}/send`)
    flash('Lien copié'); load()
  }
  async function activate(p) {
    const { data: r } = await api.post(`/service-plans/${p.id}/activate`)
    flash(`${r.job_ids.length} visites créées`); load()
  }
  async function cancel(p) {
    if (!window.confirm('Annuler ce plan et retirer les visites futures non faites ?')) return
    const { data: r } = await api.post(`/service-plans/${p.id}/cancel`)
    flash(`${r.removed_jobs} visites retirées`); load()
  }
  async function del(p) {
    if (!window.confirm('Supprimer ce brouillon ?')) return
    await api.delete(`/service-plans/${p.id}`); load()
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Plans de service</h1>
        <button onClick={() => setModal(EMPTY)} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-[#5b8eff] text-white"><Plus size={16} /> Nouveau plan</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase">Revenu annuel récurrent</div>
          <div className="text-2xl font-bold text-[#ffd166]">{money(data.arr_cents)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase">Plans actifs</div>
          <div className="text-2xl font-bold text-slate-100">{data.counts.active || 0}</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-slate-800">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-[#5b8eff] text-[#5b8eff]' : 'border-transparent text-slate-400'}`}>
            {l} <span className="text-xs opacity-70">{k ? data.counts[k] || 0 : data.total}</span>
          </button>
        ))}
      </div>
      {msg && <div className="mb-3 text-sm text-emerald-400">{msg}</div>}

      <div className="space-y-2">
        {data.plans.length === 0 && <div className="text-center text-slate-500 text-sm p-6">Aucun plan</div>}
        {data.plans.map((p) => {
          const [label, cls] = PLAN_STATUS[p.status] || PLAN_STATUS.draft
          return (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-100">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                </div>
                <div className="text-sm text-slate-400 mt-0.5">
                  <Link to={`/customers/${p.contact_id}`} className="text-[#5b8eff] hover:underline">{p.contact_name}</Link>
                  {' · '}{p.visits_per_year} visite(s)/an · {money(p.price_cents)} {FREQ[p.billing_frequency]}
                  {p.signed_at && ' · signé'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.status !== 'cancelled' && <button onClick={() => copyLink(p)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-200"><LinkIcon size={13} /> Lien</button>}
                {['draft', 'sent'].includes(p.status) && <button onClick={() => activate(p)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-700 text-white"><Play size={13} /> Activer</button>}
                {['draft', 'sent', 'active', 'past_due'].includes(p.status) && <button onClick={() => setModal(planToForm(p))} className="p-1.5 rounded-lg bg-slate-800 text-slate-300"><Pencil size={14} /></button>}
                {['active', 'sent', 'past_due'].includes(p.status) && <button onClick={() => cancel(p)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 text-red-400"><XCircle size={13} /> Annuler</button>}
                {p.status === 'draft' && <button onClick={() => del(p)} className="p-1.5 rounded-lg bg-slate-800 text-red-400"><Trash2 size={14} /></button>}
              </div>
            </div>
          )
        })}
      </div>

      {modal && <PlanForm initial={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}
