import { useEffect, useRef, useState } from 'react'
import { Upload, Check, ChevronRight, Loader2, AlertTriangle, Database } from 'lucide-react'
import api from '../api.js'

const ENTITIES = [
  { id: 'customers', label: 'Clients', hint: 'Customers' },
  { id: 'leads', label: 'Leads', hint: 'Pipeline' },
  { id: 'jobs', label: 'Jobs', hint: 'Liés au client' },
  { id: 'quotes', label: 'Soumissions', hint: 'Quotes' },
  { id: 'invoices', label: 'Factures', hint: 'Invoices + paiements' },
  { id: 'service_plans', label: 'Plans de service', hint: 'Service plans' },
]
const STEPS = ['Type', 'Fichier', 'Colonnes', 'Essai à blanc', 'Importer']
const input = 'bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 w-full'
const btn = 'px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-2'

function Report({ r }) {
  if (!r) return null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Créés', r.created], ['Mis à jour', r.updated], ['Ignorés', r.skipped]].map(([l, v]) => (
          <div key={l} className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-semibold text-[#5b8eff]">{v}</div>
            <div className="text-xs text-slate-400">{l}</div>
          </div>
        ))}
      </div>
      {[['errors', 'Erreurs', 'text-red-400'], ['warnings', 'Avertissements', 'text-amber-400']].map(([k, l, c]) =>
        r[k]?.length ? (
          <div key={k} className="bg-slate-950 rounded-lg p-3 max-h-48 overflow-auto text-xs">
            <div className={`font-medium mb-1 ${c}`}>{l} ({r[k].length})</div>
            {r[k].map((e, i) => (
              <div key={i} className="text-slate-300">Ligne {e.row}: {e.reason}</div>
            ))}
          </div>
        ) : null
      )}
    </div>
  )
}

export default function BlueworkBridge() {
  const [step, setStep] = useState(0)
  const [entity, setEntity] = useState('customers')
  const [file, setFile] = useState(null)
  const [pv, setPv] = useState(null)
  const [mapping, setMapping] = useState({})
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState(null)
  const fileRef = useRef()

  const loadStatus = () => api.get('/bridge/status').then((r) => setStatus(r.data)).catch(() => {})
  useEffect(() => { loadStatus() }, [])

  const fail = (e) => setErr(e.response?.data?.detail || e.message || 'Erreur')

  const form = (extra = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('entity', entity)
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
    return fd
  }

  const upload = async (f) => {
    setFile(f); setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f); fd.append('entity', entity)
      const { data } = await api.post('/bridge/preview', fd)
      setPv(data); setMapping(data.mapping); setStep(2)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const refreshPreview = async (m) => {
    setMapping(m)
    try {
      const { data } = await api.post('/bridge/preview', form({ mapping: JSON.stringify(m) }))
      setPv((p) => ({ ...p, rows: data.rows }))
    } catch (e) { fail(e) }
  }

  const run = async (dry) => {
    setBusy(true); setErr('')
    try {
      const { data } = await api.post('/bridge/import', form({ mapping: JSON.stringify(mapping), dry_run: dry }))
      setReport(data); setStep(dry ? 3 : 4)
      if (!dry) loadStatus()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const reset = () => { setStep(0); setFile(null); setPv(null); setReport(null); setErr('') }
  const rowCols = pv && pv.rows[0] ? Object.keys(pv.rows[0]).filter((k) => !k.startsWith('_')) : []

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto text-slate-100 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Importer depuis Blue work</h1>
        <p className="text-sm text-slate-400 mt-1">
          Dans Blue work : ouvrez la liste → <b>Export CSV</b>. Importez dans l'ordre : Clients → Leads → Jobs →
          Soumissions → Factures → Plans de service. Réimporter un fichier met à jour, sans doublons.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`px-2 py-1 rounded-full ${i === step ? 'bg-[#5b8eff] text-white' : i < step ? 'bg-slate-800 text-slate-300' : 'bg-slate-900 text-slate-500'}`}>
              {i < step && <Check size={12} className="inline mr-1" />}{i + 1}. {s}
            </span>
            {i < STEPS.length - 1 && <ChevronRight size={12} className="text-slate-600" />}
          </span>
        ))}
      </div>

      {err && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-lg p-3 flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <div className="bg-slate-900 rounded-xl p-4 md:p-5 space-y-4">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ENTITIES.map((e, i) => (
                <button key={e.id} onClick={() => setEntity(e.id)}
                  className={`text-left rounded-lg p-3 border ${entity === e.id ? 'border-[#5b8eff] bg-[#5b8eff]/10' : 'border-slate-800 bg-slate-950'}`}>
                  <div className="text-xs text-slate-500">Étape {i + 1}</div>
                  <div className="font-medium">{e.label}</div>
                  <div className="text-xs text-slate-400">{e.hint}</div>
                </button>
              ))}
            </div>
            <button className={`${btn} bg-[#5b8eff] text-white`} onClick={() => setStep(1)}>Continuer</button>
          </>
        )}

        {step === 1 && (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            <button onClick={() => fileRef.current.click()} disabled={busy}
              className="w-full border-2 border-dashed border-slate-700 rounded-xl p-10 flex flex-col items-center gap-2 text-slate-400 hover:border-[#5b8eff]">
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              <span>Choisir le CSV exporté de Blue work ({ENTITIES.find((e) => e.id === entity).label})</span>
            </button>
            <button className={`${btn} bg-slate-800`} onClick={() => setStep(0)}>Retour</button>
          </>
        )}

        {step === 2 && pv && (
          <>
            <div className="text-sm text-slate-400">{pv.row_count} lignes. Vérifiez les colonnes devinées et ajustez au besoin.</div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {pv.fields.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 text-slate-300">{f}</span>
                  <select className={input} value={mapping[f] || ''}
                    onChange={(e) => { const m = { ...mapping }; e.target.value ? (m[f] = e.target.value) : delete m[f]; refreshPreview(m) }}>
                    <option value="">— ignorer —</option>
                    {pv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-auto rounded-lg border border-slate-800">
              <table className="text-xs w-full">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>{rowCols.map((c) => <th key={c} className="text-left px-2 py-1.5 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {pv.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      {rowCols.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-500">Montants en cents, dates ISO, téléphones E.164 (aperçu des 10 premières lignes).</div>
            <div className="flex gap-2">
              <button className={`${btn} bg-slate-800`} onClick={() => setStep(1)}>Retour</button>
              <button className={`${btn} bg-[#5b8eff] text-white`} disabled={busy} onClick={() => run(true)}>
                {busy && <Loader2 size={14} className="animate-spin" />} Essai à blanc
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="text-sm text-slate-400">Essai à blanc : rien n'a été écrit.</div>
            <Report r={report} />
            <div className="flex gap-2">
              <button className={`${btn} bg-slate-800`} onClick={() => setStep(2)}>Ajuster les colonnes</button>
              <button className={`${btn} bg-[#5b8eff] text-white`} disabled={busy} onClick={() => run(false)}>
                {busy && <Loader2 size={14} className="animate-spin" />} Importer pour vrai
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} /> Import terminé.</div>
            <Report r={report} />
            <button className={`${btn} bg-[#5b8eff] text-white`} onClick={reset}>Importer un autre fichier</button>
          </>
        )}
      </div>

      <div className="bg-slate-900 rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-2"><Database size={14} /> Déjà importé de Blue work</div>
        {status ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(status).map(([k, v]) => (
              <div key={k} className="bg-slate-950 rounded-lg px-3 py-2 flex justify-between">
                <span className="text-slate-400">{k}</span><b>{v}</b>
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-slate-500">Chargement…</div>}
      </div>
    </div>
  )
}
