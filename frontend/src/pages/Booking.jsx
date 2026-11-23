import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import {
  CalendarDays, User, MapPin, Phone, Wrench, Clock, CheckCircle, Loader2,
  Plus, Minus, Trash2, Search, X, Star, BookOpen,
} from 'lucide-react'
import { fmtDuration, addMinutesToTime } from '../serviceMeta.js'

// Blue work–style "Create job": typed duration (minutes) + free line items
// (name, description, qty, unit price, taxable), price book as optional shortcuts.

const TPS = 0.05
const TVQ = 0.09975
const QUICK_DURATIONS = [30, 60, 90, 120, 180, 240]

const INPUT = "w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#5b8eff]"
const INPUT_CENTER = INPUT + " text-center"

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 mb-2">
        {Icon && <Icon size={14} className="text-slate-500" />}
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Card({ title, icon: Icon, children, right }) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Icon size={12} /> {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  )
}

const money = (cents) => (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const toCents = (v) => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100)
const emptyItem = () => ({ key: Math.random().toString(36).slice(2), name: '', description: '', qty: '1', price: '', taxable: true, service_id: null, minutes: null, showDesc: false })

export default function Booking() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'ceo'

  const [business, setBusiness] = useState('window')
  // Customer: either an existing contact or new fields
  const [existing, setExisting] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [cust, setCust] = useState({ firstName: '', lastName: '', phone: '', address: '' })

  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState('')        // typed duration in minutes
  const [minutesTouched, setMinutesTouched] = useState(false)
  const [items, setItems] = useState([emptyItem()])
  const [notes, setNotes] = useState('')

  const [services, setServices] = useState([])      // price book
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [dayCount, setDayCount] = useState(null)
  const [savedToBook, setSavedToBook] = useState({})

  useEffect(() => {
    api.get('/services', { params: { active: true } }).then(r => setServices(r.data || [])).catch(() => {})
  }, [])

  // Existing customer search (debounced)
  useEffect(() => {
    if (existing || query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      api.get('/contacts/', { params: { search: query.trim(), limit: 8 } })
        .then(r => setResults(r.data || [])).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, existing])

  // Suggested duration = sum of price-book default minutes × qty (only until the user types)
  const suggested = useMemo(() => items.reduce((s, it) => s + (it.minutes ? it.minutes * (parseFloat(it.qty) || 1) : 0), 0), [items])
  useEffect(() => {
    if (!minutesTouched) setMinutes(suggested > 0 ? String(Math.round(suggested)) : '')
  }, [suggested, minutesTouched])

  const effMinutes = parseInt(minutes, 10) || 0
  const estEnd = addMinutesToTime(time, effMinutes)

  const totals = useMemo(() => {
    let subtotal = 0, taxable = 0
    for (const it of items) {
      const line = Math.round((parseFloat(it.qty) || 0) * toCents(it.price))
      subtotal += line
      if (it.taxable) taxable += line
    }
    const tps = Math.round(taxable * TPS), tvq = Math.round(taxable * TVQ)
    return { subtotal, tps, tvq, total: subtotal + tps + tvq }
  }, [items])

  function setItem(key, patch) { setItems(list => list.map(it => it.key === key ? { ...it, ...patch } : it)) }
  function removeItem(key) { setItems(list => list.length > 1 ? list.filter(it => it.key !== key) : [emptyItem()]) }
  function addFromBook(s) {
    const it = { ...emptyItem(), name: s.name, description: s.description || '', price: (s.unit_price_cents / 100).toFixed(2),
      taxable: s.taxable !== false, service_id: s.id, minutes: s.default_minutes || null }
    setItems(list => {
      const blank = list.length === 1 && !list[0].name && !list[0].price
      return blank ? [it] : [...list, it]
    })
  }
  function pickNameSuggestion(key, name) {
    const s = services.find(x => x.name === name)
    if (s) setItem(key, { service_id: s.id, price: (s.unit_price_cents / 100).toFixed(2), taxable: s.taxable !== false, minutes: s.default_minutes || null, description: s.description || '' })
  }
  async function saveToPriceBook(it) {
    try {
      const { data } = await api.post('/services', { name: it.name.trim(), description: it.description || null,
        unit_price_cents: toCents(it.price), taxable: it.taxable, default_minutes: it.minutes || null })
      setServices(list => [...list, data])
      setItem(it.key, { service_id: data.id })
      setSavedToBook(m => ({ ...m, [it.key]: true }))
    } catch { setError("Impossible d'ajouter à la liste de prix") }
  }

  async function handleDateChange(dateStr) {
    setDate(dateStr)
    if (!dateStr) { setDayCount(null); return }
    try {
      const { data } = await api.get('/deals/', { params: { limit: 1000, business_type: business } })
      setDayCount(data.filter(d => d.expected_close_date?.slice(0, 10) === dateStr).length)
    } catch { setDayCount(null) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const lines = items.filter(it => it.name.trim())
    if (!existing && !cust.firstName.trim()) { setError('Le prénom du client est requis'); return }
    if (business === 'window' && !date) { setError('La date est requise'); return }
    if (lines.length === 0) { setError('Ajoutez au moins un service'); return }
    if (effMinutes < 0 || effMinutes > 1440) { setError('Durée entre 1 et 1440 minutes'); return }
    setSaving(true)
    try {
      const serviceNames = lines.map(it => it.name.trim())
      let contact = existing
      if (!contact) {
        const { data } = await api.post('/contacts/', {
          first_name: cust.firstName.trim(),
          last_name: cust.lastName.trim() || null,
          phone: cust.phone.trim() || null,
          address: cust.address.trim() || null,
          services: serviceNames.join(', '),
          price: totals.subtotal / 100,
          status: 'prospect',
        })
        contact = data
        if (cust.address.trim()) api.post(`/contacts/${contact.id}/geocode`).catch(() => {})
      }

      const apptIso = date ? `${date}T${time || '08:00'}:00` : null
      const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      const { data: deal } = await api.post('/deals/', {
        title: `${name} — ${serviceNames.join(', ')}`.slice(0, 250),
        value: totals.subtotal / 100,
        stage: 'qualified',
        contact_id: contact.id,
        expected_close_date: apptIso,
        notes: notes.trim() || null,
        assigned_to: user?.id,
        job_status: 'todo',
        business_type: business,
        estimated_minutes: effMinutes > 0 ? effMinutes : null,
      })

      await api.put(`/deals/${deal.id}/line-items`, lines.map(it => ({
        name: it.name.trim(),
        description: it.description.trim() || null,
        qty: parseFloat(it.qty) || 1,
        unit_price_cents: toCents(it.price),
        taxable: it.taxable,
        service_id: it.service_id,
      })))

      setSuccess(true)
      setTimeout(() => navigate('/calendar'), 1600)
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : "Impossible d'enregistrer le rendez-vous")
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center px-4 text-center" style={{ minHeight: '60vh' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-emerald-500/20">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Rendez-vous enregistré!</h2>
        <p className="text-slate-400 text-sm">Redirection vers le calendrier…</p>
      </div>
    )
  }

  const nameOptions = services.map(s => s.name)

  return (
    <div className="px-4 pt-6 pb-4 md:px-8 md:pt-8 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Nouveau travail</h1>
        <p className="text-slate-500 text-xs mt-0.5">Client, date, durée et services — comme dans Blue work</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Business selector */}
        <div className="flex gap-2">
          {[{ v: 'window', label: 'Nettoyage' }, { v: 'landscape', label: 'Pavé-uni / Aménagement' }].map(({ v, label }) => (
            <button key={v} type="button" onClick={() => setBusiness(v)}
              className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all ${
                business === v ? 'bg-[#5b8eff] border-[#5b8eff] text-white' : 'bg-slate-900 border-slate-700 text-slate-400 active:bg-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Customer */}
        <Card title="Client" icon={User}>
          {existing ? (
            <div className="flex items-start justify-between bg-slate-800/70 border border-[#5b8eff]/40 rounded-xl px-4 py-3">
              <div>
                <p className="text-slate-100 font-semibold text-sm">{existing.first_name} {existing.last_name || ''}</p>
                <p className="text-slate-400 text-xs mt-0.5">{[existing.phone, existing.address].filter(Boolean).join(' · ') || 'Aucune coordonnée'}</p>
              </div>
              <button type="button" onClick={() => { setExisting(null); setQuery('') }} className="text-slate-400 hover:text-white p-1" aria-label="Changer de client">
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher un client existant (nom, téléphone)…"
                  className={INPUT + ' pl-10'} style={{ height: '46px' }} />
                {results.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                    {results.map(c => (
                      <button key={c.id} type="button" onClick={() => { setExisting(c); setResults([]) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 border-b border-slate-700/50 last:border-0">
                        <p className="text-sm text-slate-100">{c.first_name} {c.last_name || ''}</p>
                        <p className="text-xs text-slate-400">{[c.phone, c.address].filter(Boolean).join(' · ')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">ou nouveau client</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom *">
                  <input value={cust.firstName} onChange={e => setCust(c => ({ ...c, firstName: e.target.value }))} placeholder="Jean" className={INPUT} style={{ height: '46px' }} />
                </Field>
                <Field label="Nom">
                  <input value={cust.lastName} onChange={e => setCust(c => ({ ...c, lastName: e.target.value }))} placeholder="Tremblay" className={INPUT} style={{ height: '46px' }} />
                </Field>
              </div>
              <Field label="Téléphone" icon={Phone}>
                <input type="tel" value={cust.phone} onChange={e => setCust(c => ({ ...c, phone: e.target.value }))} placeholder="450-555-1234" className={INPUT} style={{ height: '46px' }} />
              </Field>
              <Field label="Adresse du service" icon={MapPin}>
                <input value={cust.address} onChange={e => setCust(c => ({ ...c, address: e.target.value }))} placeholder="123 rue des Érables, Laval" className={INPUT} style={{ height: '46px' }} />
              </Field>
            </>
          )}
        </Card>

        {/* Date, time, duration */}
        <Card title="Date et durée" icon={CalendarDays}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} className={INPUT_CENTER} style={{ colorScheme: 'dark', height: '46px' }} />
            </Field>
            <Field label="Heure" icon={Clock}>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={INPUT_CENTER} style={{ colorScheme: 'dark', height: '46px' }} />
            </Field>
          </div>
          {dayCount !== null && (
            <p className="-mt-2 text-xs text-slate-500">
              {dayCount === 0 ? 'Aucun rendez-vous ce jour-là' : `${dayCount} rendez-vous déjà ce jour-là`}
            </p>
          )}

          <Field label="Durée estimée (minutes)" icon={Clock}
            hint={suggested > 0 && !minutesTouched ? `Suggérée à partir de la liste de prix : ${fmtDuration(Math.round(suggested))}` : null}>
            <div className="flex items-stretch gap-2">
              <button type="button" aria-label="Moins 15 minutes"
                onClick={() => { setMinutesTouched(true); setMinutes(m => String(Math.max(0, (parseInt(m, 10) || 0) - 15))) }}
                className="w-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center active:bg-slate-700"><Minus size={16} /></button>
              <input type="number" inputMode="numeric" min="0" max="1440" step="5" value={minutes}
                onChange={e => { setMinutesTouched(true); setMinutes(e.target.value) }}
                placeholder="ex. 75" className={INPUT_CENTER + ' text-base font-semibold'} style={{ height: '46px' }} />
              <button type="button" aria-label="Plus 15 minutes"
                onClick={() => { setMinutesTouched(true); setMinutes(m => String(Math.min(1440, (parseInt(m, 10) || 0) + 15))) }}
                className="w-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center active:bg-slate-700"><Plus size={16} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_DURATIONS.map(m => (
                <button key={m} type="button" onClick={() => { setMinutesTouched(true); setMinutes(String(m)) }}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${effMinutes === m ? 'bg-[#5b8eff]/20 border-[#5b8eff] text-[#9db8ff]' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                  {fmtDuration(m)}
                </button>
              ))}
            </div>
            {effMinutes > 0 && (
              <p className="mt-2 text-xs text-[#9db8ff]">
                = {fmtDuration(effMinutes)}{time && estEnd && <> · fin prévue vers <span className="font-semibold text-white">{estEnd}</span></>}
              </p>
            )}
          </Field>
        </Card>

        {/* Line items */}
        <Card title="Services" icon={Wrench}
          right={<button type="button" onClick={() => setItems(l => [...l, emptyItem()])}
            className="flex items-center gap-1 text-xs font-semibold text-[#9db8ff] hover:text-white"><Plus size={14} /> Ligne</button>}>

          {services.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1"><BookOpen size={11} /> Liste de prix (optionnel)</p>
              <div className="flex flex-wrap gap-1.5">
                {services.map(s => (
                  <button key={s.id} type="button" onClick={() => addFromBook(s)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:border-[#5b8eff]">
                    + {s.name}{s.unit_price_cents ? ` · ${money(s.unit_price_cents)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <datalist id="pricebook-names">{nameOptions.map(n => <option key={n} value={n} />)}</datalist>

          <div className="space-y-3">
            {items.map((it, idx) => {
              const line = Math.round((parseFloat(it.qty) || 0) * toCents(it.price))
              const custom = it.name.trim() && !it.service_id
              return (
                <div key={it.key} className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input list="pricebook-names" value={it.name}
                      onChange={e => { setItem(it.key, { name: e.target.value, service_id: null }); pickNameSuggestion(it.key, e.target.value) }}
                      placeholder={`Service ${idx + 1} — ex. Vitres ext. 2 étages`} className={INPUT} style={{ height: '42px' }} />
                    <button type="button" onClick={() => removeItem(it.key)} aria-label="Supprimer la ligne"
                      className="p-2 text-slate-500 hover:text-red-400 shrink-0"><Trash2 size={16} /></button>
                  </div>
                  {it.showDesc || it.description ? (
                    <textarea value={it.description} onChange={e => setItem(it.key, { description: e.target.value })}
                      placeholder="Description (optionnel) — ex. 24 fenêtres, moustiquaires incluses" rows={2}
                      className={INPUT + ' py-2 resize-none'} />
                  ) : (
                    <button type="button" onClick={() => setItem(it.key, { showDesc: true })} className="text-xs text-slate-500 hover:text-slate-300">+ description</button>
                  )}
                  <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">Qté</p>
                      <input type="number" inputMode="decimal" min="0" step="any" value={it.qty}
                        onChange={e => setItem(it.key, { qty: e.target.value })} className={INPUT_CENTER} style={{ height: '40px' }} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">Prix unitaire ($)</p>
                      <input type="number" inputMode="decimal" min="0" step="0.01" value={it.price}
                        onChange={e => setItem(it.key, { price: e.target.value })} placeholder="0.00" className={INPUT} style={{ height: '40px' }} />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 pb-2.5 text-right min-w-[80px]">{money(line)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input type="checkbox" checked={it.taxable} onChange={e => setItem(it.key, { taxable: e.target.checked })} className="accent-[#5b8eff]" />
                      Taxable (TPS + TVQ)
                    </label>
                    {isAdmin && custom && !savedToBook[it.key] && (
                      <button type="button" onClick={() => saveToPriceBook(it)} className="flex items-center gap-1 text-xs text-[#ffd166] hover:text-white">
                        <Star size={12} /> Ajouter à la liste de prix
                      </button>
                    )}
                    {savedToBook[it.key] && <span className="text-xs text-emerald-400">Ajouté à la liste de prix</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-slate-700/60 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-400"><span>Sous-total</span><span>{money(totals.subtotal)}</span></div>
            <div className="flex justify-between text-slate-500 text-xs"><span>TPS (5 %)</span><span>{money(totals.tps)}</span></div>
            <div className="flex justify-between text-slate-500 text-xs"><span>TVQ (9,975 %)</span><span>{money(totals.tvq)}</span></div>
            <div className="flex justify-between text-white font-bold pt-1"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
        </Card>

        <Card title="Notes" icon={BookOpen}>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Instructions spéciales, code d'accès, préférences du client…" rows={3}
            className={INPUT + ' py-3 resize-none'} />
        </Card>

        {error && (
          <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm" role="alert">{error}</div>
        )}

        <button type="submit" disabled={saving}
          className="w-full font-bold rounded-2xl text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 bg-[#5b8eff] active:bg-[#4a7aeb] text-white"
          style={{ height: '56px' }}>
          {saving ? <Loader2 size={20} className="animate-spin" /> : <CalendarDays size={20} />}
          {saving ? 'Enregistrement…' : 'Créer le travail'}
        </button>
      </form>
    </div>
  )
}
