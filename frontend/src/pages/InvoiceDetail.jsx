import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Send, Link as LinkIcon, DollarSign, Save, Ban, ExternalLink } from 'lucide-react'
import api from '../api.js'
import { StatusPill } from './Invoices.jsx'

const TPS = 0.05
const TVQ = 0.09975

// Mirror of backend/money.py compute_totals (items in cents)
export function computeTotals(items, discountType, discountValue, tipCents) {
  let subtotal = 0, taxable = 0
  for (const i of items) {
    const line = Math.round((Number(i.qty) || 0) * (i.unit_price_cents || 0))
    subtotal += line
    if (i.taxable) taxable += line
  }
  let discount = 0
  const dv = Number(discountValue) || 0
  if (discountType === 'percent') discount = Math.round((subtotal * Math.min(Math.max(dv, 0), 100)) / 100)
  else if (discountType === 'fixed') discount = Math.min(Math.round(dv), subtotal)
  const taxableAfter = taxable - (subtotal ? Math.round((discount * taxable) / subtotal) : 0)
  const tps = Math.round(taxableAfter * TPS)
  const tvq = Math.round(taxableAfter * TVQ)
  return { subtotal, discount, tps, tvq, total: subtotal - discount + tps + tvq + (tipCents || 0) }
}

const fmt = (c) => ((c || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const toCents = (v) => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100)
const dollars = (c) => ((c || 0) / 100).toFixed(2)
const dayStr = (d) => (d ? String(d).slice(0, 10) : '')
const today = () => new Date().toISOString().slice(0, 10)

const METHODS = [['interac', 'Interac'], ['cash', 'Comptant'], ['cheque', 'Chèque'], ['card', 'Carte'], ['stripe', 'Stripe'], ['other', 'Autre']]
const inputCls = 'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5b8eff] text-slate-100'
const blank = () => ({ name: '', description: '', qty: 1, price: '', taxable: true, service_id: null })

export default function InvoiceDetail() {
  const { id } = useParams()
  const [qs] = useSearchParams()
  const nav = useNavigate()
  const isNew = !id || id === 'new'

  const [inv, setInv] = useState(null)
  const [contact, setContact] = useState(null) // {id, name}
  const [cq, setCq] = useState('')
  const [cresults, setCresults] = useState([])
  const [items, setItems] = useState([blank()])
  const [discType, setDiscType] = useState('')
  const [discVal, setDiscVal] = useState('')
  const [tip, setTip] = useState('')
  const [due, setDue] = useState(today())
  const [notes, setNotes] = useState('')
  const [services, setServices] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ method: 'interac', amount: '', date: today(), reference: '' })

  const editable = isNew || ['draft', 'sent', 'viewed'].includes(inv?.status)

  const hydrate = (d) => {
    setInv(d)
    setContact({ id: d.contact_id, name: d.contact_name })
    setItems(d.items.length ? d.items.map((i) => ({ name: i.name, description: i.description || '', qty: i.qty, price: dollars(i.unit_price_cents), taxable: i.taxable, service_id: i.service_id })) : [blank()])
    setDiscType(d.discount_type || '')
    setDiscVal(d.discount_type === 'fixed' ? dollars(d.discount_value) : d.discount_value || '')
    setTip(d.tip_cents ? dollars(d.tip_cents) : '')
    setDue(dayStr(d.due_date) || today())
    setNotes(d.notes || '')
  }

  useEffect(() => {
    if (isNew) {
      const dealId = qs.get('deal_id')
      const contactId = qs.get('contact_id')
      if (dealId) {
        api.post(`/billing/invoices/from-job/${dealId}`).then((r) => nav(`/invoices/${r.data.id}`, { replace: true })).catch(() => setMsg('Impossible de créer depuis le travail'))
      } else if (contactId) {
        api.get(`/contacts/${contactId}`).then((r) => setContact({ id: r.data.id, name: `${r.data.first_name || ''} ${r.data.last_name || ''}`.trim() })).catch(() => {})
      }
    } else {
      api.get(`/billing/invoices/${id}`).then((r) => hydrate(r.data)).catch(() => setMsg('Facture introuvable'))
    }
    api.get('/services').then((r) => setServices((Array.isArray(r.data) ? r.data : r.data?.items || []).filter((s) => s.active !== false))).catch(() => setServices([]))
    // eslint-disable-next-line
  }, [id])

  useEffect(() => {
    if (!cq || cq.length < 2) return setCresults([])
    const t = setTimeout(() => api.get('/contacts', { params: { search: cq, limit: 8 } }).then((r) => setCresults(r.data)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [cq])

  const apiItems = items.filter((i) => i.name.trim()).map((i) => ({
    name: i.name, description: i.description || null, qty: Number(i.qty) || 0,
    unit_price_cents: toCents(i.price), taxable: !!i.taxable, service_id: i.service_id || null,
  }))
  const discountValue = discType === 'fixed' ? toCents(discVal) : parseFloat(discVal) || 0
  const totals = useMemo(() => computeTotals(apiItems, discType || null, discountValue, toCents(tip)), [items, discType, discVal, tip]) // eslint-disable-line
  const paid = inv?.paid_cents || 0
  const balance = Math.max(totals.total - paid, 0)

  const payload = () => ({
    contact_id: contact?.id, items: apiItems, discount_type: discType || null, discount_value: discountValue,
    tip_cents: toCents(tip), due_date: due ? `${due}T00:00:00` : null, notes: notes || null,
  })

  const wrap = async (fn) => {
    setBusy(true); setMsg('')
    try { await fn() } catch (e) { setMsg(e.response?.data?.detail || 'Erreur') } finally { setBusy(false) }
  }

  const save = () => wrap(async () => {
    if (!contact?.id) throw { response: { data: { detail: 'Choisissez un client' } } }
    if (isNew) {
      const r = await api.post('/billing/invoices', { ...payload(), deal_id: qs.get('deal_id') ? Number(qs.get('deal_id')) : null })
      nav(`/invoices/${r.data.id}`, { replace: true })
    } else {
      const r = await api.put(`/billing/invoices/${id}`, payload())
      hydrate(r.data); setMsg('Enregistré')
    }
  })

  const send = (channel) => wrap(async () => {
    if (!isNew && editable) await api.put(`/billing/invoices/${id}`, payload())
    const r = await api.post(`/billing/invoices/${id}/send`, { channel })
    if (channel === 'link') {
      try { await navigator.clipboard.writeText(r.data.url) } catch { /* ignore */ }
      setMsg(`Lien copié : ${r.data.url}`)
    } else setMsg(r.data.sms_sent ? 'SMS envoyé' : 'SMS enregistré (Twilio non configuré ou échec)')
    hydrate((await api.get(`/billing/invoices/${id}`)).data)
  })

  const recordPayment = () => wrap(async () => {
    const r = await api.post(`/billing/invoices/${id}/payments`, {
      method: pay.method, amount_cents: toCents(pay.amount), reference: pay.reference || null,
      paid_at: pay.date ? `${pay.date}T12:00:00` : null,
    })
    hydrate(r.data); setPayOpen(false)
  })

  const delPayment = (pid) => wrap(async () => { if (confirm('Supprimer ce paiement ?')) hydrate((await api.delete(`/billing/payments/${pid}`)).data) })
  const cancel = () => wrap(async () => { if (confirm('Annuler cette facture ?')) hydrate((await api.post(`/billing/invoices/${id}/cancel`)).data) })
  const del = () => wrap(async () => { if (confirm('Supprimer ce brouillon ?')) { await api.delete(`/billing/invoices/${id}`); nav('/invoices') } })

  const setItem = (idx, patch) => setItems((l) => l.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  const addService = (sid) => {
    const s = services.find((x) => String(x.id) === sid)
    if (!s) return
    setItems((l) => [...l.filter((i) => i.name.trim() || i.price), { name: s.name, description: s.description || '', qty: 1, price: dollars(s.unit_price_cents), taxable: s.taxable !== false, service_id: s.id }])
  }

  const publicUrl = inv ? `${window.location.origin}/i/${inv.token}` : null

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto text-slate-100">
      <button onClick={() => nav('/invoices')} className="flex items-center gap-1 text-sm text-slate-400 mb-3"><ArrowLeft size={14} /> Factures</button>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">{isNew ? 'Nouvelle facture' : inv?.number}</h1>
        {inv && <StatusPill inv={inv} />}
        {publicUrl && inv.status !== 'draft' && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: '#5b8eff' }}><ExternalLink size={12} /> Vue client</a>
        )}
      </div>
      {msg && <div className="mb-3 text-sm bg-slate-900 border border-slate-800 rounded-lg px-3 py-2" style={{ color: '#ffd166' }}>{msg}</div>}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <label className="text-xs text-slate-400">Client</label>
        {contact?.id ? (
          <div className="flex items-center justify-between mt-1">
            <span className="font-medium">{contact.name}</span>
            {editable && <button className="text-xs text-slate-400 underline" onClick={() => setContact(null)}>Changer</button>}
          </div>
        ) : (
          <div className="relative mt-1">
            <input className={inputCls} placeholder="Rechercher un client…" value={cq} onChange={(e) => setCq(e.target.value)} />
            {cresults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                {cresults.map((c) => (
                  <button key={c.id} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-800"
                    onClick={() => { setContact({ id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() }); setCq(''); setCresults([]) }}>
                    {c.first_name} {c.last_name} <span className="text-slate-500">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Lignes</h2>
          {editable && services.length > 0 && (
            <select className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm" value="" onChange={(e) => addService(e.target.value)}>
              <option value="">+ Du prix catalogue…</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {fmt(s.unit_price_cents)}</option>)}
            </select>
          )}
        </div>
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_60px_90px_auto_auto] gap-2 mb-2 items-center">
            <input className={inputCls} placeholder="Description" disabled={!editable} value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} />
            <input className={inputCls} type="number" min="0" step="any" disabled={!editable} value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} />
            <input className={inputCls} placeholder="0.00" inputMode="decimal" disabled={!editable} value={it.price} onChange={(e) => setItem(idx, { price: e.target.value })} />
            <label className="text-xs text-slate-400 flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={it.taxable} onChange={(e) => setItem(idx, { taxable: e.target.checked })} />Tx</label>
            {editable && <button onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, i) => i !== idx) : [blank()]))} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>}
          </div>
        ))}
        {editable && <button onClick={() => setItems((l) => [...l, blank()])} className="text-sm flex items-center gap-1 mt-1" style={{ color: '#5b8eff' }}><Plus size={14} /> Ajouter une ligne</button>}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-xs text-slate-400">Rabais</label>
            <div className="flex gap-2">
              <select className={inputCls} disabled={!editable} value={discType} onChange={(e) => setDiscType(e.target.value)}>
                <option value="">Aucun</option><option value="percent">%</option><option value="fixed">$</option>
              </select>
              <input className={inputCls} disabled={!editable || !discType} value={discVal} onChange={(e) => setDiscVal(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Pourboire ($)</label>
            <input className={inputCls} disabled={!editable} value={tip} onChange={(e) => setTip(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Échéance</label>
            <input type="date" className={inputCls} disabled={!editable} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Notes</label>
            <input className={inputCls} disabled={!editable} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 ml-auto max-w-xs text-sm space-y-1">
          <Row l="Sous-total" v={fmt(totals.subtotal)} />
          {totals.discount > 0 && <Row l="Rabais" v={`-${fmt(totals.discount)}`} />}
          <Row l="TPS (5 %)" v={fmt(totals.tps)} />
          <Row l="TVQ (9,975 %)" v={fmt(totals.tvq)} />
          {toCents(tip) > 0 && <Row l="Pourboire" v={fmt(toCents(tip))} />}
          <div className="border-t border-slate-700 pt-1"><Row l={<b>Total</b>} v={<b>{fmt(totals.total)}</b>} /></div>
          {!isNew && <Row l="Payé" v={fmt(paid)} />}
          {!isNew && <Row l={<b style={{ color: '#ffd166' }}>Solde</b>} v={<b style={{ color: '#ffd166' }}>{fmt(balance)}</b>} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {editable && <Btn onClick={save} disabled={busy} primary><Save size={15} /> Enregistrer</Btn>}
        {!isNew && editable && <Btn onClick={() => send('sms')} disabled={busy}><Send size={15} /> Envoyer par SMS</Btn>}
        {!isNew && editable && <Btn onClick={() => send('link')} disabled={busy}><LinkIcon size={15} /> Copier le lien</Btn>}
        {!isNew && inv && !['cancelled', 'refunded', 'paid'].includes(inv.status) && (
          <Btn onClick={() => { setPay({ ...pay, amount: dollars(inv.balance_cents) }); setPayOpen(true) }}><DollarSign size={15} /> Enregistrer un paiement</Btn>
        )}
        {!isNew && inv?.status === 'draft' && <Btn onClick={del} disabled={busy}><Trash2 size={15} /> Supprimer</Btn>}
        {!isNew && inv && !['cancelled', 'paid', 'draft'].includes(inv.status) && <Btn onClick={cancel} disabled={busy}><Ban size={15} /> Annuler</Btn>}
      </div>

      {inv?.payments?.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="font-semibold mb-2">Paiements</h2>
          {inv.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0 text-sm">
              <div>
                <div>{METHODS.find((m) => m[0] === p.method)?.[1] || p.method} {p.reference && <span className="text-slate-500">· {p.reference}</span>}</div>
                <div className="text-xs text-slate-500">{dayStr(p.paid_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-300">{fmt(p.amount_cents)}</span>
                <button onClick={() => delPayment(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {payOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPayOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Enregistrer un paiement</h3>
            <select className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input className={inputCls} inputMode="decimal" placeholder="Montant ($)" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <input type="date" className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
            <input className={inputCls} placeholder="Référence (optionnel)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setPayOpen(false)}>Annuler</Btn>
              <Btn primary onClick={recordPayment} disabled={busy || toCents(pay.amount) <= 0}>Enregistrer</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ l, v }) {
  return <div className="flex justify-between"><span className="text-slate-400">{l}</span><span>{v}</span></div>
}

function Btn({ children, primary, ...p }) {
  return (
    <button {...p} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${primary ? 'text-slate-950' : 'bg-slate-800 text-slate-100 border border-slate-700'}`}
      style={primary ? { background: '#5b8eff' } : undefined}>{children}</button>
  )
}
