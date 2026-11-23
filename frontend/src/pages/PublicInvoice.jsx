import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const T = {
  fr: {
    invoice: 'Facture', billedTo: 'Facturé à', date: 'Date', due: 'Échéance', desc: 'Description', qty: 'Qté', price: 'Prix', amount: 'Montant',
    subtotal: 'Sous-total', discount: 'Rabais', tip: 'Pourboire', total: 'Total', paid: 'Payé', balance: 'Solde dû', paidStamp: 'PAYÉE',
    interacTitle: 'Payer par virement Interac', interacBody: (e, n) => `Envoyez un virement Interac à ${e} avec le numéro de facture ${n} en message. Dépôt automatique activé.`,
    print: 'Imprimer', thanks: 'Merci de votre confiance!', review: 'Laissez-nous un avis Google', notFound: 'Facture introuvable', loading: 'Chargement…', taxNo: 'No', overdue: 'En retard',
  },
  en: {
    invoice: 'Invoice', billedTo: 'Billed to', date: 'Date', due: 'Due', desc: 'Description', qty: 'Qty', price: 'Price', amount: 'Amount',
    subtotal: 'Subtotal', discount: 'Discount', tip: 'Tip', total: 'Total', paid: 'Paid', balance: 'Balance due', paidStamp: 'PAID',
    interacTitle: 'Pay by Interac e-Transfer', interacBody: (e, n) => `Send an Interac e-Transfer to ${e} with invoice number ${n} in the message. Auto-deposit is enabled.`,
    print: 'Print', thanks: 'Thank you for your business!', review: 'Leave us a Google review', notFound: 'Invoice not found', loading: 'Loading…', taxNo: 'No.', overdue: 'Overdue',
  },
}

export default function PublicInvoice() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [lang, setLang] = useState('fr')
  const t = T[lang]

  useEffect(() => {
    fetch(`/api/public/invoices/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true))
  }, [token])

  const fmt = (c) => ((c || 0) / 100).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' })
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA') : '—')

  if (err) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>{t.notFound}</div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>{t.loading}</div>

  const co = data.company
  const isPaid = data.status === 'paid'
  const td = { padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '20px 12px', fontFamily: 'system-ui, sans-serif', color: '#111827' }}>
      <style>{`@media print { .no-print { display: none !important } body { background: #fff } }`}</style>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} style={btn}>{lang === 'fr' ? 'EN' : 'FR'}</button>
        <button onClick={() => window.print()} style={{ ...btn, background: '#5b8eff', color: '#fff', border: 'none' }}>{t.print}</button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 28, position: 'relative', boxShadow: '0 1px 6px rgba(0,0,0,.08)' }}>
        {isPaid && (
          <div style={{ position: 'absolute', top: 90, right: 40, transform: 'rotate(-12deg)', border: '4px solid #10b981', color: '#10b981', fontWeight: 800, fontSize: 36, padding: '4px 16px', borderRadius: 8, opacity: 0.85 }}>{t.paidStamp}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '3px solid #5b8eff', paddingBottom: 14 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>ZF<span style={{ color: '#5b8eff' }}>.</span> <span style={{ fontSize: 18 }}>{co.name}</span></div>
            <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>{co.address}<br />{co.phone}{co.email ? ` · ${co.email}` : ''}</div>
            {(co.tps_number || co.tvq_number) && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {co.tps_number && <>TPS {t.taxNo} {co.tps_number}</>}{co.tps_number && co.tvq_number && ' · '}{co.tvq_number && <>TVQ {t.taxNo} {co.tvq_number}</>}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{t.invoice} {data.number}</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>{t.date}: {fmtDate(data.issue_date)}</div>
            <div style={{ fontSize: 13, color: data.overdue ? '#dc2626' : '#4b5563' }}>{t.due}: {fmtDate(data.due_date)}{data.overdue ? ` (${t.overdue})` : ''}</div>
          </div>
        </div>

        <div style={{ margin: '16px 0', fontSize: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>{t.billedTo}</div>
          <div style={{ fontWeight: 600 }}>{data.customer.name}</div>
          {data.customer.address && <div style={{ color: '#4b5563' }}>{data.customer.address}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
              <th style={td}>{t.desc}</th><th style={{ ...td, textAlign: 'right' }}>{t.qty}</th><th style={{ ...td, textAlign: 'right' }}>{t.price}</th><th style={{ ...td, textAlign: 'right' }}>{t.amount}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id}>
                <td style={td}>{i.name}{i.description && <div style={{ fontSize: 12, color: '#6b7280' }}>{i.description}</div>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{i.qty}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmt(i.unit_price_cents)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmt(i.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginLeft: 'auto', maxWidth: 300, marginTop: 14, fontSize: 14 }}>
          <Line l={t.subtotal} v={fmt(data.subtotal_cents)} />
          {data.discount_cents > 0 && <Line l={t.discount} v={`-${fmt(data.discount_cents)}`} />}
          <Line l="TPS (5 %)" v={fmt(data.tps_cents)} />
          <Line l="TVQ (9,975 %)" v={fmt(data.tvq_cents)} />
          {data.tip_cents > 0 && <Line l={t.tip} v={fmt(data.tip_cents)} />}
          <Line l={<b>{t.total}</b>} v={<b>{fmt(data.total_cents)}</b>} top />
          <Line l={t.paid} v={fmt(data.paid_cents)} />
          <Line l={<b>{t.balance}</b>} v={<b style={{ color: data.balance_cents > 0 ? '#b45309' : '#059669' }}>{fmt(data.balance_cents)}</b>} />
        </div>

        {data.notes && <div style={{ marginTop: 16, fontSize: 13, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{data.notes}</div>}

        {!isPaid && data.interac_email && (
          <div style={{ marginTop: 20, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 14, fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.interacTitle}</div>
            {t.interacBody(data.interac_email, data.number)}
          </div>
        )}

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
          {t.thanks}
          {co.review_link && <div className="no-print"><a href={co.review_link} style={{ color: '#5b8eff' }}>{t.review}</a></div>}
        </div>
      </div>
    </div>
  )
}

const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }

function Line({ l, v, top }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: top ? '1px solid #d1d5db' : 'none', marginTop: top ? 4 : 0 }}>
      <span style={{ color: '#4b5563' }}>{l}</span><span>{v}</span>
    </div>
  )
}
