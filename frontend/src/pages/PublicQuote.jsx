import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

// Public customer page: NO auth, plain fetch (the axios client redirects to /login on 401).
const T = {
  fr: {
    quote: 'Soumission', for: 'Pour', service: 'Service', qty: 'Qté', price: 'Prix', subtotal: 'Sous-total',
    discount: 'Rabais', total: 'Total', accept: 'Accepter la soumission', decline: 'Refuser',
    signHere: 'Signez ici', clear: 'Effacer', fullName: 'Nom complet', needSig: 'Veuillez signer et indiquer votre nom.',
    accepted: 'Merci! Soumission acceptée.', acceptedSub: 'Nous vous contacterons bientôt pour planifier le travail.',
    declined: 'Soumission refusée.', declinedSub: 'Merci de nous avoir répondu.',
    notFound: 'Soumission introuvable.', error: 'Une erreur est survenue. Réessayez.', loading: 'Chargement…',
    expired: 'Cette soumission a expiré.', taxIncl: 'Taxes en sus', questions: 'Questions? Appelez-nous',
    confirmDecline: 'Refuser cette soumission ?',
  },
  en: {
    quote: 'Quote', for: 'For', service: 'Service', qty: 'Qty', price: 'Price', subtotal: 'Subtotal',
    discount: 'Discount', total: 'Total', accept: 'Accept quote', decline: 'Decline',
    signHere: 'Sign here', clear: 'Clear', fullName: 'Full name', needSig: 'Please sign and enter your name.',
    accepted: 'Thank you! Quote accepted.', acceptedSub: 'We will contact you shortly to schedule the work.',
    declined: 'Quote declined.', declinedSub: 'Thanks for letting us know.',
    notFound: 'Quote not found.', error: 'Something went wrong. Please try again.', loading: 'Loading…',
    expired: 'This quote has expired.', taxIncl: 'Taxes extra', questions: 'Questions? Call us',
    confirmDecline: 'Decline this quote?',
  },
}

function SignaturePad({ canvasRef, onChange, label, clearLabel }) {
  const drawing = useRef(false)
  const last = useRef(null)

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: (p.clientX - r.left) * (c.width / r.width), y: (p.clientY - r.top) * (c.height / r.height) }
  }
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e) }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827'
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
    onChange(true)
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    onChange(false)
  }

  // Non-passive touch listeners so preventDefault stops page scrolling while signing.
  useEffect(() => {
    const c = canvasRef.current
    c.addEventListener('touchstart', start, { passive: false })
    c.addEventListener('touchmove', move, { passive: false })
    c.addEventListener('touchend', end)
    return () => {
      c.removeEventListener('touchstart', start)
      c.removeEventListener('touchmove', move)
      c.removeEventListener('touchend', end)
    }
  }, [])

  return (
    <div>
      <div className="flex justify-between text-sm text-gray-500 mb-1">
        <span>{label}</span>
        <button type="button" onClick={clear} className="text-blue-600">{clearLabel}</button>
      </div>
      <canvas ref={canvasRef} width={600} height={200}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        className="w-full h-32 bg-white border-2 border-dashed border-gray-300 rounded-lg touch-none" />
    </div>
  )
}

export default function PublicQuote() {
  const { token } = useParams()
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('zf_lang')
      if (saved === 'fr' || saved === 'en') return saved
    } catch { /* ignore */ }
    return 'fr'
  })
  const [q, setQ] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notfound | error
  const [name, setName] = useState('')
  const [hasSig, setHasSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canvasRef = useRef(null)
  const t = T[lang]

  const money = (c) => ((c || 0) / 100).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' })

  useEffect(() => {
    fetch(`/api/public/quotes/${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 404) return setState('notfound')
        if (!r.ok) return setState('error')
        const d = await r.json()
        setQ(d); setState('ready')
        if (d.language === 'en' || d.language === 'fr') {
          try { if (!localStorage.getItem('zf_lang')) setLang(d.language) } catch { setLang(d.language) }
        }
      })
      .catch(() => setState('error'))
  }, [token])

  const switchLang = (l) => { setLang(l); try { localStorage.setItem('zf_lang', l) } catch {} }

  const post = async (path, body) => {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      })
      if (!r.ok) throw new Error()
      setQ(await r.json())
    } catch { setErr(t.error) } finally { setBusy(false) }
  }

  const accept = () => {
    if (q.require_signature && (!name.trim() || !hasSig)) { setErr(t.needSig); return }
    post('accept', {
      signature_name: name.trim() || null,
      signature_data: hasSig ? canvasRef.current.toDataURL('image/png') : null,
    })
  }
  const decline = () => { if (window.confirm(t.confirmDecline)) post('decline') }

  const expired = q && q.expires_at && new Date(q.expires_at) < new Date() && !['accepted', 'declined'].includes(q.status)
  const open = q && ['sent', 'viewed'].includes(q.status) && !expired

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#2f5fd0]">{q?.company?.name || 'ZF Entretien'}</div>
          <div className="flex text-xs border border-gray-300 rounded-full overflow-hidden">
            {['fr', 'en'].map(l => (
              <button key={l} onClick={() => switchLang(l)}
                className={`px-3 py-1 uppercase ${lang === l ? 'bg-[#2f5fd0] text-white' : 'bg-white text-gray-600'}`}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {state === 'loading' && <p className="text-center text-gray-500 py-16">{t.loading}</p>}
        {state === 'notfound' && <p className="text-center text-gray-500 py-16">{t.notFound}</p>}
        {state === 'error' && <p className="text-center text-red-600 py-16">{t.error}</p>}

        {state === 'ready' && q && (
          <>
            <div className="mb-4">
              <div className="text-sm text-gray-500">{t.quote} {q.number}</div>
              <h1 className="text-2xl font-semibold">{q.title || t.quote}</h1>
              <div className="text-gray-600">{t.for} {q.customer_name}</div>
            </div>

            {q.status === 'accepted' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-emerald-800">
                <div className="font-semibold">{t.accepted}</div><div className="text-sm">{t.acceptedSub}</div>
              </div>
            )}
            {q.status === 'declined' && (
              <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 mb-4 text-gray-700">
                <div className="font-semibold">{t.declined}</div><div className="text-sm">{t.declinedSub}</div>
              </div>
            )}
            {expired && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-amber-800">{t.expired}</div>}

            {q.message && <p className="bg-white border border-gray-200 rounded-xl p-4 mb-4 text-gray-700 whitespace-pre-wrap">{q.message}</p>}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
              {q.items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3 p-4 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium">{i.name}</div>
                    {i.description && <div className="text-sm text-gray-500">{i.description}</div>}
                    <div className="text-xs text-gray-400">{t.qty} {i.qty} × {money(i.unit_price_cents)}</div>
                  </div>
                  <div className="font-medium whitespace-nowrap">{money(Math.round(i.qty * i.unit_price_cents))}</div>
                </div>
              ))}
              <div className="bg-gray-50 p-4 space-y-1 text-sm">
                <Line k={t.subtotal} v={money(q.subtotal_cents)} />
                {q.discount_cents > 0 && <Line k={t.discount} v={`− ${money(q.discount_cents)}`} />}
                <Line k="TPS (5 %)" v={money(q.tps_cents)} />
                <Line k="TVQ (9,975 %)" v={money(q.tvq_cents)} />
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                  <span>{t.total}</span><span>{money(q.total_cents)}</span>
                </div>
              </div>
            </div>

            {open && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                {q.require_signature && (
                  <>
                    <SignaturePad canvasRef={canvasRef} onChange={setHasSig} label={t.signHere} clearLabel={t.clear} />
                    <input value={name} onChange={e => setName(e.target.value)} placeholder={t.fullName}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
                  </>
                )}
                {err && <div className="text-sm text-red-600">{err}</div>}
                <button disabled={busy} onClick={accept}
                  className="w-full bg-[#2f5fd0] hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg text-base">
                  {t.accept}
                </button>
                <button disabled={busy} onClick={decline} className="w-full text-gray-500 py-2 text-sm">{t.decline}</button>
              </div>
            )}

            <footer className="text-center text-sm text-gray-500 mt-8 space-y-0.5">
              <div>{t.questions} : {q.company.phone}</div>
              {q.company.website && <div>{q.company.website}</div>}
              {(q.company.tps_number || q.company.tvq_number) && (
                <div className="text-xs">TPS {q.company.tps_number} · TVQ {q.company.tvq_number}</div>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

function Line({ k, v }) {
  return <div className="flex justify-between text-gray-600"><span>{k}</span><span>{v}</span></div>
}
