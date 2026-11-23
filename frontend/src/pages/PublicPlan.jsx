import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

const FREQ = { per_visit: 'par visite / per visit', monthly: 'par mois / per month', yearly: 'par an / per year' }
const money = (c) => ((c || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const fmtD = (s) => (s ? new Date(s).toLocaleDateString('fr-CA', { dateStyle: 'long' }) : null)

function SignaturePad({ onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return [(t.clientX - r.left) * (ref.current.width / r.width), (t.clientY - r.top) * (ref.current.height / r.height)]
  }
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = ref.current.getContext('2d'); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d'); const [x, y] = pos(e)
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; ctx.lineTo(x, y); ctx.stroke()
  }
  const end = () => { if (drawing.current) { drawing.current = false; onChange(ref.current.toDataURL('image/png')) } }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onChange(null) }

  return (
    <div>
      <canvas ref={ref} width={600} height={180}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none"
        style={{ touchAction: 'none' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button type="button" onClick={clear} className="text-sm text-gray-500 underline mt-1">Effacer / Clear</button>
    </div>
  )
}

export default function PublicPlan() {
  const { token } = useParams()
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/public/plans/${token}`).then(async (r) => {
      if (!r.ok) throw new Error()
      const p = await r.json(); setPlan(p); if (p.signed_at) setDone(true)
    }).catch(() => setError('Plan introuvable / Plan not found'))
  }, [token])

  async function sign() {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/public/plans/${token}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_name: name, signature_data: sig }),
      })
      if (!r.ok) throw new Error()
      setPlan(await r.json()); setDone(true)
    } catch { setError('Erreur lors de la signature / Signing failed') } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-[#1d3a8a] text-white py-5 px-4 text-center">
        <div className="text-xl font-bold tracking-wide">ZF Entretien</div>
        <div className="text-xs opacity-80">Nettoyage extérieur · 438-905-0602</div>
      </header>
      <main className="max-w-xl mx-auto p-4">
        {error && !plan && <div className="mt-8 text-center text-red-600">{error}</div>}
        {!plan && !error && <div className="mt-8 text-center text-gray-500">Chargement…</div>}
        {plan && (
          <div className="bg-white rounded-xl shadow p-5 mt-4 space-y-4">
            <div>
              <div className="text-xs uppercase text-gray-500">Plan de service / Service plan</div>
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <div className="text-gray-600">{plan.contact_name}{plan.property_label ? ` · ${plan.property_label}` : ''}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500">Prix / Price</div><div className="font-semibold">{money(plan.price_cents)} <span className="font-normal text-gray-500">{FREQ[plan.billing_frequency]}</span></div></div>
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500">Visites / Visits</div><div className="font-semibold">{plan.visits_per_year} / an</div></div>
              {plan.start_date && <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500">Début / Start</div><div className="font-semibold">{fmtD(plan.start_date)}</div></div>}
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500">Fin / End</div><div className="font-semibold">{plan.end_date ? fmtD(plan.end_date) : "Jusqu'à annulation"}</div></div>
            </div>
            {plan.included_services && <div><div className="text-sm font-semibold mb-1">Services inclus / Included</div><div className="text-sm text-gray-700 whitespace-pre-wrap">{plan.included_services}</div></div>}
            {plan.terms && <div><div className="text-sm font-semibold mb-1">Conditions / Terms</div><div className="text-xs text-gray-600 whitespace-pre-wrap">{plan.terms}</div></div>}

            {done ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-center">
                <div className="font-semibold">Merci! Votre plan est activé. / Thank you! Your plan is active.</div>
                {plan.signature_name && <div className="text-sm mt-1">Signé par {plan.signature_name}</div>}
              </div>
            ) : plan.status === 'cancelled' || plan.status === 'expired' ? (
              <div className="text-center text-gray-500">Ce plan n'est plus disponible. / This plan is no longer available.</div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-semibold">Signature</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet / Full name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                <SignaturePad onChange={setSig} />
                {error && <div className="text-red-600 text-sm">{error}</div>}
                <button onClick={sign} disabled={busy || !name.trim() || !sig}
                  className="w-full py-3 rounded-lg bg-[#1d3a8a] text-white font-semibold disabled:opacity-40">
                  {busy ? '…' : "Signer et accepter / Sign & accept"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
