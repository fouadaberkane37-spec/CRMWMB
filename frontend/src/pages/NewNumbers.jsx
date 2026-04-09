import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { PhoneIncoming, MessageSquare, PhoneCall, UserPlus, X, Loader2, RefreshCw } from 'lucide-react'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

function AddContactModal({ lead, onClose, onConverted }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    if (!firstName.trim()) return
    setSaving(true)
    try {
      await api.post(`/twilio/unknown-leads/${lead.id}/convert`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      onConverted()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to convert')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Add to Contacts</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <X size={16} />
          </button>
        </div>
        <p className="text-slate-400 text-xs mb-4">{lead.phone}</p>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="First name *"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-400 py-3 rounded-xl text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !firstName.trim()}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            Add Contact
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NewNumbers() {
  const [leads, setLeads]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [converting, setConverting] = useState(null) // lead to convert
  const [callingId, setCallingId]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/twilio/unknown-leads')
      setLeads(data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function dismiss(id) {
    try {
      await api.delete(`/twilio/unknown-leads/${id}`)
      setLeads(prev => prev.filter(l => l.id !== id))
    } catch {}
  }

  async function callLead(phone, id) {
    setCallingId(id)
    try {
      // Initiate call via Twilio — create a temporary contact-less call
      const sid   = await api.post('/twilio/call-number', { phone })
    } catch (err) {
      alert(err.response?.data?.detail || 'Call failed')
    } finally {
      setTimeout(() => setCallingId(null), 3000)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <PhoneIncoming size={20} className="text-amber-400" />
            <h1 className="text-white text-xl font-bold tracking-tight">New Numbers</h1>
          </div>
          <p className="text-slate-500 text-xs ml-8">Unknown callers &amp; texters</p>
        </div>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-amber-400 animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <PhoneIncoming size={40} className="mb-3 opacity-40" />
          <p className="text-sm">No unknown contacts yet</p>
          <p className="text-xs mt-1 text-slate-700">Calls and texts from new numbers will appear here</p>
        </div>
      ) : (
        <div className="px-4 space-y-2 pb-8">
          {leads.map(lead => (
            <div
              key={lead.id}
              className="bg-slate-900 border border-slate-700/40 rounded-2xl px-4 py-3.5 flex items-center gap-3"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                {lead.source === 'call'
                  ? <PhoneIncoming size={18} className="text-amber-400" />
                  : <MessageSquare size={18} className="text-amber-400" />
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{lead.phone}</p>
                <p className="text-slate-500 text-xs truncate mt-0.5">{lead.last_body}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    lead.source === 'call'
                      ? 'bg-indigo-900/40 text-indigo-400'
                      : 'bg-emerald-900/40 text-emerald-400'
                  }`}>
                    {lead.source === 'call' ? 'Call' : 'SMS'}
                  </span>
                  {lead.count > 1 && (
                    <span className="text-[10px] text-slate-600">{lead.count}× contacts</span>
                  )}
                  <span className="text-[10px] text-slate-600">{timeAgo(lead.updated_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setConverting(lead)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400"
                  title="Add to contacts"
                >
                  <UserPlus size={16} />
                </button>
                <button
                  onClick={() => dismiss(lead.id)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-500"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add to contacts modal */}
      {converting && (
        <AddContactModal
          lead={converting}
          onClose={() => setConverting(null)}
          onConverted={() => { setConverting(null); load() }}
        />
      )}
    </div>
  )
}
