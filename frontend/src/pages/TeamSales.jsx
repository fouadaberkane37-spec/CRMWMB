import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { Users, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

function fmtMoney(v) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

const JOB_BADGE = {
  todo:            'bg-indigo-900/40 text-indigo-400',
  payment_pending: 'bg-amber-900/40 text-amber-400',
  done:            'bg-emerald-900/40 text-emerald-400',
  cancelled:       'bg-slate-800 text-slate-500',
}
const JOB_LABEL = {
  todo: 'To Do', payment_pending: 'Pending', done: 'Done', cancelled: 'Cancelled',
}

export default function TeamSales() {
  const [deals, setDeals]   = useState([])
  const [users, setUsers]   = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dealsRes, usersRes] = await Promise.all([
        api.get('/deals/', { params: { limit: 1000 } }),
        api.get('/users/'),
      ])
      const userMap = {}
      for (const u of usersRes.data) userMap[u.id] = u
      setUsers(userMap)
      setDeals(dealsRes.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Group by creator
  const byUser = {}
  for (const deal of deals) {
    const uid = deal.created_by ?? 0
    if (!byUser[uid]) byUser[uid] = []
    byUser[uid].push(deal)
  }

  const groups = Object.entries(byUser).map(([uid, userDeals]) => {
    const u      = users[Number(uid)] || {}
    const name   = u.full_name || u.username || `User #${uid}`
    const role   = u.role || 'user'
    const margin = role === 'admin' ? 0.80 : 0.35
    const gross  = userDeals.reduce((s, d) => s + (d.value || 0), 0)
    const profit = gross * margin
    return { uid: Number(uid), name, role, margin, deals: userDeals, gross, profit }
  }).sort((a, b) => b.gross - a.gross)

  const totalGross  = groups.reduce((s, g) => s + g.gross, 0)
  const totalProfit = groups.reduce((s, g) => s + g.profit, 0)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <Users size={20} className="text-indigo-400" />
            <h1 className="text-white text-xl font-bold tracking-tight">Team Sales</h1>
          </div>
          <p className="text-slate-500 text-xs ml-8">Revenue breakdown by salesperson</p>
        </div>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-8">

          {/* Totals banner */}
          <div className="grid grid-cols-2 gap-3 mb-1">
            <div className="bg-slate-900 border border-slate-700/40 rounded-2xl px-4 py-3">
              <p className="text-slate-500 text-xs mb-0.5">Gross Revenue</p>
              <p className="text-white font-bold text-lg">{fmtMoney(totalGross)}</p>
              <p className="text-slate-600 text-xs">{deals.length} deals</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/40 rounded-2xl px-4 py-3">
              <p className="text-slate-500 text-xs mb-0.5">Total Profit</p>
              <p className="text-emerald-400 font-bold text-lg">{fmtMoney(totalProfit)}</p>
              <p className="text-slate-600 text-xs">blended margin</p>
            </div>
          </div>

          {/* Per-person cards */}
          {groups.map(({ uid, name, role, margin, deals: userDeals, gross, profit }) => {
            const isOpen   = !!expanded[uid]
            const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            const pct      = totalGross > 0 ? (gross / totalGross) * 100 : 0

            return (
              <div key={uid} className="bg-slate-900 border border-slate-700/40 rounded-2xl overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(e => ({ ...e, [uid]: !e[uid] }))}
                  className="w-full flex items-center gap-3 px-4 py-4 active:bg-slate-800/60"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 text-xs font-bold">{initials}</span>
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white font-semibold text-sm truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-500 text-xs capitalize">{role}</span>
                      <span className="text-slate-700 text-xs">·</span>
                      <span className="text-slate-500 text-xs">{userDeals.length} deals</span>
                      <span className="text-slate-700 text-xs">·</span>
                      <span className="text-slate-500 text-xs">{Math.round(margin * 100)}% margin</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-1 bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-emerald-400 font-bold text-sm">{fmtMoney(profit)}</p>
                    <p className="text-slate-500 text-xs">{fmtMoney(gross)} gross</p>
                  </div>

                  {isOpen
                    ? <ChevronUp size={15} className="text-slate-600 flex-shrink-0" />
                    : <ChevronDown size={15} className="text-slate-600 flex-shrink-0" />}
                </button>

                {/* Deal list */}
                {isOpen && (
                  <div className="border-t border-slate-800">
                    {userDeals
                      .slice()
                      .sort((a, b) => (b.value || 0) - (a.value || 0))
                      .map(deal => {
                        const client = deal.contact
                          ? `${deal.contact.first_name} ${deal.contact.last_name || ''}`.trim()
                          : deal.title
                        const date = deal.expected_close_date?.slice(0, 10)
                        const badge = JOB_BADGE[deal.job_status] || JOB_BADGE.todo
                        const label = JOB_LABEL[deal.job_status] || deal.job_status
                        return (
                          <div key={deal.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 last:border-b-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-100 text-sm truncate">{client}</p>
                              {date && <p className="text-slate-500 text-xs">{date}</p>}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${badge}`}>{label}</span>
                            <p className="text-white text-sm font-semibold flex-shrink-0 w-14 text-right">
                              ${(deal.value || 0).toFixed(0)}
                            </p>
                          </div>
                        )
                      })}
                    {/* Subtotal */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-800/30">
                      <p className="text-slate-400 text-xs">Profit ({Math.round(margin * 100)}% of {fmtMoney(gross)})</p>
                      <p className="text-emerald-400 font-bold text-sm">{fmtMoney(profit)}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
