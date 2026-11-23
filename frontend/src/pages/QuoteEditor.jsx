import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import { StatusPill, money } from './Quotes.jsx'
import { ArrowLeft, Plus, Trash2, Send, Link as LinkIcon, Check, X, Briefcase, Save, Search, Loader2 } from 'lucide-react'

const TPS = 0.05
const TVQ = 0.09975

// Mirror of backend/money.py compute_totals (cents).
function computeTotals(items, discountType, discountValue) {
  let subtotal = 0, taxable = 0
  items.forEach(i => {
    const line = Math.round((Number(i.qty) || 0) * Math.round((parseFloat(i.price) || 0) * 100))
    subtotal += line
    if (i.taxable) taxable += line
  })
  let discount = 0
  if (discountType === 'percent') discount = Math.round(subtotal * Math.min(Math.max(discountValue || 0, 0), 100) / 100)
  else if (discountType === 'fixed') discount = Math.min(Math.round((discountValue || 0) * 100), subtotal)
  const taxableAfter = taxable - (subtotal ? Math.round(discount * taxable / subtotal) : 0)
  const tps = Math.round(taxableAfter * TPS)
  const tvq = Math.round(taxableAfter * TVQ)
  return { subtotal, discount, tps, tvq, total: subtotal - discount + tps + tvq }
}

const input = 'bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#5b8eff]'
const btn = 'flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg disabled:opacity-50'

export default function QuoteEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const isNew = !id || id === 'new'

  const [quote, setQuote] = useState(null)
  const [contact, setContact] = useState(null)
  const [contactQ, setContactQ] = useState('')
  const [contactResults, setContactResults] = useState([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState([])
  const [discountType, setDiscountType] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [requireSig, setRequireSig] = useState(true)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/services', { params: { active: true } }).then(r => setServices(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    api.get(`/quotes/${id}`).then(r => {
      const q = r.data
      setQuote(q)
      setContact({ id: q.contact_id, name: q.contact_name })
      setTitle(q.title || '')
      setMessage(q.message || '')
      setDiscountType(q.discount_type || '')
      setDiscountValue(q.discount_type === 'fixed' ? (q.discount_value || 0) / 100 : (q.discount_value || ''))
      setRequireSig(q.require_signature)
      setItems((q.items || []).map(i => ({
        service_id: i.service_id, name: i.name, description: i.description || '',
        qty: i.qty, price: (i.unit_price_cents / 100).toString(), taxable: i.taxable,
      })))
    }).catch(() => setMsg('Soumission introuvable')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!contactQ.trim()) { setContactResults([]); return }
    const t = setTimeout(() => {
      api.get('/contacts/', { params: { search: contactQ, limit: 8 } })
        .then(r => setContactResults(r.data)).catch(() => setContactResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [contactQ])

  const locked = quote && !['draft', 'sent', 'viewed'].includes(quote.status)
  const totals = useMemo(() => computeTotals(items, discountType, parseFloat(discountValue) || 0),
    [items, discountType, discountValue])

  const setItem = (idx, patch) => setItems(its => its.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addService = (sid) => {
    const s = services.find(x => String(x.id) === String(sid))
    if (!s) return
    setItems(its => [...its, { service_id: s.id, name: s.name, description: s.description || '', qty: 1,
      price: (s.unit_price_cents / 100).toString(), taxable: s.taxable }])
  }
  const addCustom = () => setItems(its => [...its, { service_id: null, name: '', description: '', qty: 1, price: '0', taxable: true }])

  const payload = () => ({
    contact_id: contact?.id, title, message, require_signature: requireSig,
    discount_type: discountType || null,
    discount_value: discountType === 'fixed' ? Math.round((parseFloat(discountValue) || 0) * 100) : (parseFloat(discountValue) || 0),
    items: items.filter(i => i.name.trim()).map(i => ({
      service_id: i.service_id, name: i.name, description: i.description || null,
      qty: Number(i.qty) || 0, unit_price_cents: Math.round((parseFloat(i.price) || 0) * 100), taxable: i.taxable,
    })),
  })

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg('')
    try { const r = await fn(); if (okMsg) setMsg(okMsg); return r }
    catch (e) { setMsg(e.response?.data?.detail || 'Erreur'); return null }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!contact) { setMsg('Choisissez un client'); return null }
    return run(async () => {
      const r = isNew ? await api.post('/quotes', payload()) : await api.put(`/quotes/${id}`, payload())
      setQuote(r.data)
      if (isNew) nav(`/quotes/${r.data.id}`, { replace: true })
      return r.data
    }, 'Enregistrée')
  }

  const sendSms = async () => {
    const q = await save(); if (!q) return
    if (!window.confirm('Envoyer la soumission par SMS au client ?')) return
    const r = await run(() => api.post(`/quotes/${q.id}/send`, { channel: 'sms' }), 'SMS envoyé')
    if (r) setQuote(prev => ({ ...prev, ...r.data }))
  }

  const copyLink = async () => {
    const q = await save(); if (!q) return
    const r = await run(() => api.post(`/quotes/${q.id}/send`, { channel: 'link' }))
    if (!r) return
    try { await navigator.clipboard.writeText(r.data.link); setMsg('Lien copié') }
    catch { window.prompt('Copiez le lien :', r.data.link) }
    setQuote(prev => ({ ...prev, ...r.data }))
  }

  const mark = async (status) => {
    const r = await run(() => api.post(`/quotes/${id}/mark`, { status }), status === 'accepted' ? 'Marquée acceptée' : 'Marquée refusée')
    if (r) setQuote(prev => ({ ...prev, ...r.data }))
  }

  const convert = async () => {
    const r = await run(() => api.post(`/quotes/${id}/convert`, {}))
    if (r) { setQuote(r.data.quote); setMsg('Travail créé') }
  }

  const remove = async () => {
    if (!window.confirm('Supprimer ce brouillon ?')) return
    const r = await run(() => api.delete(`/quotes/${id}`))
    if (r) nav('/quotes')
  }

  if (loading) return <div className="flex justify-center py-12 text-slate-500"><Loader2 className="animate-spin" /></div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
      <button onClick={() => nav('/quotes')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3">
        <ArrowLeft size={16} /> Soumissions
      </button>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold text-white">{quote ? `Soumission ${quote.number}` : 'Nouvelle soumission'}</h1>
        {quote && <StatusPill status={quote.status} />}
      </div>
      {msg && <div className="mb-3 text-sm text-[#ffd166]">{msg}</div>}

      {/* Customer */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <label className="text-xs text-slate-500 uppercase">Client</label>
        {contact ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-white">{contact.name}</span>
            {(!quote || !locked) && (!quote || quote.status === 'draft') && (
              <button onClick={() => setContact(null)} className="text-xs text-slate-400 hover:text-white">Changer</button>
            )}
          </div>
        ) : (
          <div className="relative mt-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={contactQ} onChange={e => setContactQ(e.target.value)} placeholder="Rechercher un client"
              className={`${input} w-full pl-8`} />
            {contactResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                {contactResults.map(c => (
                  <button key={c.id} onClick={() => { setContact({ id: c.id, name: `${c.first_name} ${c.last_name || ''}`.trim() }); setContactQ(''); setContactResults([]) }}
                    className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
                    {c.first_name} {c.last_name} <span className="text-slate-500">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input value={title} onChange={e => setTitle(e.target.value)} disabled={locked} placeholder="Titre (ex. Lavage de vitres)"
          className={`${input} w-full mt-3`} />
      </section>

      {/* Items */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-sm font-medium text-white mr-auto">Services</h2>
          {!locked && (
            <>
              <select value="" onChange={e => addService(e.target.value)} className={input}>
                <option value="">+ Ajouter de la liste de prix</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} ({money(s.unit_price_cents)})</option>)}
              </select>
              <button onClick={addCustom} className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`}><Plus size={14} /> Ligne libre</button>
            </>
          )}
        </div>
        {items.length === 0 && <div className="text-sm text-slate-500 py-3">Aucune ligne.</div>}
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950/50 rounded-lg p-2">
              <input disabled={locked} className={`${input} col-span-12 md:col-span-5`} value={it.name} onChange={e => setItem(idx, { name: e.target.value })} placeholder="Description" />
              <input disabled={locked} type="number" min="0" step="0.5" className={`${input} col-span-3 md:col-span-1`} value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} />
              <div className="col-span-4 md:col-span-2 flex items-center gap-1">
                <span className="text-slate-500 text-sm">$</span>
                <input disabled={locked} type="number" min="0" step="0.01" className={`${input} w-full`} value={it.price} onChange={e => setItem(idx, { price: e.target.value })} />
              </div>
              <label className="col-span-3 md:col-span-2 text-xs text-slate-400 flex items-center gap-1">
                <input disabled={locked} type="checkbox" checked={it.taxable} onChange={e => setItem(idx, { taxable: e.target.checked })} /> Taxable
              </label>
              <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-2 text-sm text-white">
                <span className="hidden md:inline">{money(Math.round((Number(it.qty) || 0) * Math.round((parseFloat(it.price) || 0) * 100)))}</span>
                {!locked && <button onClick={() => setItems(its => its.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 ml-auto max-w-xs text-sm space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Rabais</span>
            <div className="flex gap-1">
              <select disabled={locked} value={discountType} onChange={e => setDiscountType(e.target.value)} className={input}>
                <option value="">Aucun</option><option value="percent">%</option><option value="fixed">$</option>
              </select>
              {discountType && <input disabled={locked} type="number" min="0" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className={`${input} w-20`} />}
            </div>
          </div>
          <Row k="Sous-total" v={money(totals.subtotal)} />
          {totals.discount > 0 && <Row k="Rabais" v={`− ${money(totals.discount)}`} />}
          <Row k="TPS (5 %)" v={money(totals.tps)} />
          <Row k="TVQ (9,975 %)" v={money(totals.tvq)} />
          <div className="flex justify-between text-base font-semibold text-white border-t border-slate-700 pt-2">
            <span>Total</span><span className="text-[#ffd166]">{money(totals.total)}</span>
          </div>
        </div>
      </section>

      {/* Message */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <label className="text-xs text-slate-500 uppercase">Message au client</label>
        <textarea disabled={locked} rows={3} value={message} onChange={e => setMessage(e.target.value)} className={`${input} w-full mt-1`} />
        <label className="flex items-center gap-2 text-sm text-slate-300 mt-3">
          <input disabled={locked} type="checkbox" checked={requireSig} onChange={e => setRequireSig(e.target.checked)} />
          Exiger une signature à l'acceptation
        </label>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!locked && <button disabled={busy} onClick={save} className={`${btn} bg-[#5b8eff] text-white hover:bg-blue-500`}><Save size={15} /> Enregistrer</button>}
        {!locked && <button disabled={busy} onClick={sendSms} className={`${btn} bg-slate-800 text-white hover:bg-slate-700`}><Send size={15} /> Envoyer par SMS</button>}
        {!locked && <button disabled={busy} onClick={copyLink} className={`${btn} bg-slate-800 text-white hover:bg-slate-700`}><LinkIcon size={15} /> Copier le lien</button>}
        {quote && !['accepted', 'declined'].includes(quote.status) && (
          <>
            <button disabled={busy} onClick={() => mark('accepted')} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`}><Check size={15} /> Marquer acceptée</button>
            <button disabled={busy} onClick={() => mark('declined')} className={`${btn} bg-red-800 text-white hover:bg-red-700`}><X size={15} /> Marquer refusée</button>
          </>
        )}
        {quote && quote.status !== 'declined' && !quote.deal_id && (
          <button disabled={busy} onClick={convert} className={`${btn} bg-[#ffd166] text-slate-900 font-medium hover:bg-yellow-300`}><Briefcase size={15} /> Convertir en travail</button>
        )}
        {quote?.deal_id && <button onClick={() => nav('/deals')} className={`${btn} bg-slate-800 text-emerald-400`}><Briefcase size={15} /> Travail créé</button>}
        {quote?.status === 'draft' && <button disabled={busy} onClick={remove} className={`${btn} text-red-400 hover:text-red-300 ml-auto`}><Trash2 size={15} /> Supprimer</button>}
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return <div className="flex justify-between text-slate-300"><span className="text-slate-400">{k}</span><span>{v}</span></div>
}
