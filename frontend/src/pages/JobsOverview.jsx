import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { Activity, RefreshCw, Loader2, CheckCircle2, Clock, DollarSign, AlertCircle } from 'lucide-react'

function fmtMoney(v) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const STATUS = {
  todo:            { label: 'To Do',    dot: 'bg-indigo-400', row: 'border-l-indigo-500',  text: 'text-indigo-400',  badge: 'bg-indigo-900/40 text-indigo-300' },
  payment_pending: { label: 'Pending',  dot: 'bg-amber-400',  row: 'border-l-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-900/40 text-amber-300' },
  done:            { label: 'Done',     dot: 'bg-emerald-400',row: 'border-l-emerald-500',  text: 'text-emerald-400', badge: 'bg-emerald-900/40 text-emerald-300' },
}

const TABS = [
  { key: 'todo',            label: 'To Do' },
  { key: 'payment_pending', label: 'Pending Payment' },
  { key: 'done',            label: 'Collected' },
]

export default function JobsOverview() {
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState('todo')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/deals/', { params: { limit: 1000 } })
      setDeals(r.data.filter(d => d.job_status !== 'cancelled' && d.expected_close_date))
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const todo    = deals.filter(d => d.job_status === 'todo')
  const pending = deals.filter(d => d.job_status === 'payment_pending')
  const done    = deals.filter(d => d.job_status === 'done')

  const todoValue    = todo.reduce((s, d) => s + (d.value || 0), 0)
  const pendingValue = pending.reduce((s, d) => s + (d.value || 0), 0)
  const doneValue    = done.reduce((s, d) => s + (d.value || 0), 0)

  const visible = tab === 'todo' ? todo : tab === 'payment_pending' ? pending : done

  // sort by date: upcoming first for todo/pending, most recent first for done
  const sorted = [...visible].sort((a, b) => {
    const da = new Date(a.expected_close_date)
    const db = new Date(b.expected_close_date)
    return tab === 'done' ? db - da : da - db
  })

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">

      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <Activity size={20} className="text-indigo-400" />
            <h1 className="text-white text-xl font-bold tracking-tight">Jobs Overview</h1>
          </div>
          <p className="text-slate-500 text-xs ml-8">Live status of all booked jobs</p>
        </div>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="px-4 mb-4 grid grid-cols-3 gap-2">
        {/* To Do */}
        <div className="bg-slate-900 border border-indigo-700/30 rounded-2xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={13} className="text-indigo-400" />
            <p className="text-indigo-400 text-[10px] font-semibold uppercase tracking-wide">To Do</p>
          </div>
          <p className="text-white font-bold text-lg leading-none">{todo.length}</p>
          <p className="text-indigo-300 text-xs font-medium mt-1">{fmtMoney(todoValue)}</p>
        </div>

        {/* Payment Pending */}
        <div className="bg-slate-900 border border-amber-700/30 rounded-2xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle size={13} className="text-amber-400" />
            <p className="text-amber-400 text-[10px] font-semibold uppercase tracking-wide">Pending</p>
          </div>
          <p className="text-white font-bold text-lg leading-none">{pending.length}</p>
          <p className="text-amber-300 text-xs font-medium mt-1">{fmtMoney(pendingValue)}</p>
        </div>

        {/* Collected */}
        <div className="bg-slate-900 border border-emerald-700/30 rounded-2xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <p className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wide">Collected</p>
          </div>
          <p className="text-white font-bold text-lg leading-none">{done.length}</p>
          <p className="text-emerald-300 text-xs font-medium mt-1">{fmtMoney(doneValue)}</p>
        </div>
      </div>

      {/* Total outstanding banner */}
      {(pendingValue + todoValue) > 0 && (
        <div className="mx-4 mb-4 bg-slate-900 border border-slate-700/40 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-slate-400" />
            <p className="text-slate-400 text-sm">Total outstanding</p>
          </div>
          <p className="text-white font-bold text-base">{fmtMoney(todoValue + pendingValue)}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 mb-3 flex gap-2">
        {TABS.map(({ key, label }) => {
          const count = key === 'todo' ? todo.length : key === 'payment_pending' ? pending.length : done.length
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                tab === key
                  ? key === 'todo'            ? 'bg-indigo-600 border-indigo-500 text-white'
                  : key === 'payment_pending' ? 'bg-amber-600 border-amber-500 text-white'
                  :                             'bg-emerald-700 border-emerald-600 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {label}
              <span className={`ml-1 text-[10px] ${tab === key ? 'opacity-80' : 'text-slate-500'}`}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
          <CheckCircle2 size={40} className="opacity-30" />
          <p className="text-sm">No jobs in this category</p>
        </div>
      ) : (
        <div className="px-4 space-y-2 pb-8">

          {/* Section total */}
          <div className="flex items-center justify-between px-1 mb-1">
            <p className="text-slate-500 text-xs">{sorted.length} job{sorted.length !== 1 ? 's' : ''}</p>
            <p className="text-slate-400 text-xs font-semibold">
              {fmtMoney(sorted.reduce((s, d) => s + (d.value || 0), 0))} total
            </p>
          </div>

          {sorted.map(deal => {
            const contact = deal.contact || {}
            const name = contact.first_name
              ? `${contact.first_name} ${contact.last_name || ''}`.trim()
              : deal.title
            const st = STATUS[deal.job_status] || STATUS.todo
            const svcList = (contact.services || '').split(',').map(s => s.trim()).filter(Boolean)

            return (
              <div
                key={deal.id}
                className={`bg-slate-900 border-l-4 rounded-r-2xl rounded-l-sm ${st.row} overflow-hidden`}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-sm truncate">{name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${st.badge}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-slate-500 text-xs">{fmtDate(deal.expected_close_date)}</p>
                      {svcList.length > 0 && (
                        <>
                          <span className="text-slate-700 text-xs">·</span>
                          <p className="text-slate-500 text-xs truncate">{svcList.join(', ')}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <p className={`font-bold text-base shrink-0 ${st.text}`}>
                    {fmtMoney(deal.value || 0)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
