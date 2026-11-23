// Offline outbox: actions made without a connection are stored on the phone
// (IndexedDB, photos included) and uploaded in order once the connection is back.
// Each action has a client_ref so a retry never creates a duplicate on the server.
import api from './api.js'

const DB_NAME = 'zfcrm-offline'
const STORE = 'outbox'
let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function tx(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const out = fn(store)
    t.oncomplete = () => resolve(out?.result ?? out)
    t.onerror = () => reject(t.error)
  })
}

export function newRef() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

export async function listOutbox() {
  const all = await tx('readonly', (s) => s.getAll())
  return (all || []).sort((a, b) => a.seq - b.seq)
}

let seqCounter = Date.now()
async function put(entry) { await tx('readwrite', (s) => s.put(entry)) }
async function remove(id) { await tx('readwrite', (s) => s.delete(id)) }

const listeners = new Set()
export function onOutboxChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }
async function notify() {
  const items = await listOutbox().catch(() => [])
  listeners.forEach((fn) => fn(items))
  window.dispatchEvent(new CustomEvent('zf-outbox', { detail: items }))
}

/** Queue an action. type: knock | knock-status | booking | photo */
export async function enqueue(type, payload, extra = {}) {
  const entry = { id: newRef(), seq: seqCounter++, type, payload, createdAt: Date.now(), tries: 0, lastError: null, ...extra }
  await put(entry)
  await notify()
  flush()          // try right away (works instantly when online)
  return entry
}

// ── Sending ──────────────────────────────────────────────────────────────────

async function send(entry) {
  const p = entry.payload
  switch (entry.type) {
    case 'knock':
      return api.post('/sync/knock', p)
    case 'knock-status':
      return api.post('/sync/knock-status', p)
    case 'booking':
      return api.post('/sync/booking', p)
    case 'photo': {
      const fd = new FormData()
      fd.append('owner_type', p.owner_type)
      if (p.owner_id) fd.append('owner_id', String(p.owner_id))
      if (p.owner_client_ref) fd.append('owner_client_ref', p.owner_client_ref)
      fd.append('client_ref', p.client_ref)
      if (p.caption) fd.append('caption', p.caption)
      fd.append('file', entry.blob, p.filename || 'photo.jpg')
      return api.post('/attachments', fd)
    }
    default:
      throw new Error('unknown outbox type ' + entry.type)
  }
}

let flushing = false
export async function flush() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    const items = await listOutbox()
    for (const entry of items) {
      try {
        await send(entry)
        await remove(entry.id)
      } catch (err) {
        const status = err.response?.status
        if (!err.response) break                       // still offline / server unreachable → retry later
        if (status === 409) { entry.tries++; await put(entry); continue }   // depends on an earlier item
        if (status === 401) break                      // login expired → wait for re-login
        entry.tries++
        entry.lastError = (typeof err.response?.data?.detail === 'string' && err.response.data.detail) || `Erreur ${status}`
        if (status >= 400 && status < 500 && entry.tries >= 5) entry.failed = true
        await put(entry)
      }
    }
  } finally {
    flushing = false
    notify()
  }
}

export async function discard(id) { await remove(id); notify() }

// Auto-sync: when the connection comes back, when the app is reopened, and every 30 s.
let started = false
export function startAutoSync() {
  if (started) return
  started = true
  window.addEventListener('online', () => flush())
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush() })
  setInterval(() => flush(), 30000)
  flush()
}

// ── Photos ──────────────────────────────────────────────────────────────────

/** Shrink a camera photo to max 1600 px JPEG (~300-600 KB) before storing/uploading. */
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob || file
  } catch {
    return file   // e.g. HEIC the browser can't decode: upload as-is
  }
}

/** Fetch a protected attachment as an object URL (img src can't send the auth header). */
export async function attachmentUrl(url) {
  const r = await api.get(url.replace(/^\/api/, ''), { responseType: 'blob' })
  return URL.createObjectURL(r.data)
}
