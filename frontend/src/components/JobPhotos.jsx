import React, { useEffect, useState, useCallback } from 'react'
import { Camera, X, Loader2, CloudOff } from 'lucide-react'
import api from '../api.js'
import { attachmentUrl, enqueue, newRef, compressImage, listOutbox, onOutboxChange } from '../offline.js'

// Photos attached to a job (customer's specific requests). Shows uploaded photos,
// photos still waiting in the offline outbox, and lets the tech add more on site.
export default function JobPhotos({ dealId, compact = false }) {
  const [photos, setPhotos] = useState([])       // { id, src, caption }
  const [pending, setPending] = useState([])     // outbox photos for this job
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/attachments', { params: { owner_type: 'job', owner_id: dealId } })
      const withSrc = await Promise.all(data.filter(a => (a.content_type || '').startsWith('image/'))
        .map(async a => ({ ...a, src: await attachmentUrl(a.url).catch(() => null) })))
      setPhotos(prev => { prev.forEach(p => p.src && URL.revokeObjectURL(p.src)); return withSrc })
    } catch { /* offline: keep what we have */ }
    finally { setLoading(false) }
  }, [dealId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const apply = (list) => setPending(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.src))
      return list.filter(e => e.type === 'photo' && e.payload.owner_type === 'job' && e.payload.owner_id === dealId)
        .map(e => ({ id: e.id, src: URL.createObjectURL(e.blob), caption: e.payload.caption }))
    })
    listOutbox().then(apply).catch(() => {})
    let had = 0
    return onOutboxChange(list => {
      apply(list)
      const n = list.filter(e => e.type === 'photo').length
      if (n < had) load()
      had = n
    })
  }, [dealId, load])

  async function add(fileList) {
    for (const f of Array.from(fileList || [])) {
      const blob = await compressImage(f)
      await enqueue('photo', { owner_type: 'job', owner_id: dealId, client_ref: newRef(), caption: null, filename: 'photo.jpg' },
        { blob, summary: `Photo · travail #${dealId}` })
    }
  }

  const all = [...photos, ...pending.map(p => ({ ...p, pending: true }))]
  if (compact && !loading && all.length === 0) return null

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Camera size={12} /> Photos de la demande {all.length > 0 && `(${all.length})`}
        </h3>
        <label className="text-xs font-semibold text-[#9db8ff] cursor-pointer flex items-center gap-1">
          <Camera size={13} /> Ajouter
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { add(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {loading ? (
        <Loader2 size={16} className="animate-spin text-slate-500" />
      ) : all.length === 0 ? (
        <p className="text-xs text-slate-500">Aucune photo</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {all.map(p => (
            <button key={p.id} type="button" onClick={() => p.src && setZoom(p)} className="relative rounded-lg overflow-hidden bg-slate-900 h-20">
              {p.src && <img src={p.src} alt={p.caption || ''} className="w-full h-full object-cover" />}
              {p.pending && <span className="absolute bottom-1 left-1 bg-amber-500/90 text-[10px] text-black font-bold rounded px-1 flex items-center gap-0.5"><CloudOff size={9} /> en attente</span>}
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-[10001] bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 text-white p-2" aria-label="Fermer" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}><X size={22} /></button>
          <img src={zoom.src} alt="" className="max-h-[80vh] max-w-full rounded-lg" />
          {zoom.caption && <p className="text-white text-sm mt-3 text-center">{zoom.caption}</p>}
        </div>
      )}
    </div>
  )
}
