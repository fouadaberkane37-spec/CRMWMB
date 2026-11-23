import React, { useEffect, useState } from 'react'
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { listOutbox, onOutboxChange, flush, discard } from '../offline.js'

const LABEL = { knock: 'Épingle', 'knock-status': 'Statut épingle', booking: 'Rendez-vous', photo: 'Photo' }

// Small floating pill: offline / N waiting to upload / synced.
export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [justSynced, setJustSynced] = useState(false)

  useEffect(() => {
    listOutbox().then(setItems).catch(() => {})
    const off = onOutboxChange((list) => {
      setItems((prev) => {
        if (prev.length > 0 && list.length === 0) { setJustSynced(true); setTimeout(() => setJustSynced(false), 3000) }
        return list
      })
    })
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { off(); window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const failed = items.filter((i) => i.failed)
  if (online && items.length === 0 && !justSynced) return null

  let tone = 'bg-slate-800 border-slate-600 text-slate-100', Icon = RefreshCw, text = ''
  if (justSynced && items.length === 0) { tone = 'bg-emerald-900/90 border-emerald-600 text-emerald-100'; Icon = CheckCircle2; text = 'Tout est synchronisé' }
  else if (!online) { tone = 'bg-amber-900/90 border-amber-600 text-amber-100'; Icon = CloudOff; text = items.length ? `Hors ligne · ${items.length} en attente` : 'Hors ligne' }
  else if (failed.length) { tone = 'bg-red-900/90 border-red-600 text-red-100'; Icon = AlertTriangle; text = `${failed.length} élément(s) à vérifier` }
  else { text = `Envoi… ${items.length}` }

  return (
    <div className="fixed right-3 md:right-auto md:left-1/2 md:-translate-x-1/2 z-[10000] flex flex-col items-end md:items-center" style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}>
      <button onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold shadow-lg backdrop-blur whitespace-nowrap ${tone}`}>
        <Icon size={12} className={!justSynced && online && items.length && !failed.length ? 'animate-spin' : ''} />
        {text}
      </button>
      {open && items.length > 0 && (
        <div className="mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 max-h-80 overflow-y-auto">
          {items.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-2 px-2 py-1.5 border-b border-slate-800 last:border-0">
              <div className="min-w-0">
                <p className="text-xs text-slate-200">{LABEL[i.type] || i.type} · {new Date(i.createdAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</p>
                {i.summary && <p className="text-[11px] text-slate-400 truncate">{i.summary}</p>}
                {i.lastError && <p className="text-[11px] text-red-400">{i.lastError}</p>}
              </div>
              {i.failed && (
                <button onClick={() => window.confirm('Supprimer cet élément non envoyé?') && discard(i.id)} className="text-slate-500 hover:text-red-400 p-0.5" aria-label="Supprimer"><X size={13} /></button>
              )}
            </div>
          ))}
          {online && <button onClick={() => flush()} className="w-full mt-1 text-xs text-[#9db8ff] py-1.5">Réessayer maintenant</button>}
        </div>
      )}
    </div>
  )
}
