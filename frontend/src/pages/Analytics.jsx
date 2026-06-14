import React, { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Users, BookOpen, MapPin, TrendingUp, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────
function localFmt(d) {
  // Returns YYYY-MM-DD in LOCAL time (avoids UTC-midnight off-by-one)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getRange(filter, customStart, customEnd) {
  const today = new Date()
  if (filter === 'today') {
    const s = localFmt(today)
    return { start: s, end: s }
  }
  if (filter === 'week') {
    const dow = today.getDay()                          // 0 = Sun
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const mon = new Date(today)
    mon.setDate(today.getDate() + diffToMon)
    return { start: localFmt(mon), end: localFmt(today) }
  }
  if (filter === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: localFmt(first), end: localFmt(today) }
  }
  if (filter === 'custom') return { start: customStart, end: customEnd }
  return null
}

function fmtTick(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
]

const METRIC_CARDS = [
  {
    key: 'contacts_created',
    label: 'Contacts',
    icon: Users,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    key: 'appointments_booked',
    label: 'Appointments',
    icon: BookOpen,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    key: 'pins_placed',
    label: 'Pins Placed',
    icon: MapPin,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
]

const BARS = [
  { key: 'contacts',     name: 'Contacts',     fill: '#6366f1' },
  { key: 'appointments', name: 'Appointments', fill: '#10b981' },
  { key: 'pins',         name: 'Pins',         fill: '#f59e0b' },
]

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-slate-300 text-xs font-semibold mb-1.5">{fmtTick(label)}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span style={{ color: p.fill }}>●</span>
          <span className="text-slate-400">{p.name}</span>
          <span className="text-white font-bold ml-auto pl-3">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth()
  const [filter, setFilter]           = useState('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  const load = useCallback(async (f, cs, ce) => {
    const range = getRange(f, cs, ce)
    if (!range?.start || !range?.end) return
    if (range.start > range.end) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/analytics/sales', { params: range })
      setData(res.data)
    } catch {
      setError('Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load on preset filters
  useEffect(() => {
    if (filter !== 'custom') load(filter, '', '')
  }, [filter, load])

  // Auto-load when both custom dates are valid
  useEffect(() => {
    if (filter === 'custom' && customStart && customEnd && customStart <= customEnd) {
      load('custom', customStart, customEnd)
    }
  }, [filter, customStart, customEnd, load])

  const chartData = data?.daily_breakdown ?? []
  const hasChartData = chartData.some(r => r.contacts > 0 || r.appointments > 0 || r.pins > 0)

  // For single-day view, skip the chart (just summary cards)
  const singleDay = chartData.length <= 1

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">

      {/* ── Header ── */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-0.5">
          <TrendingUp size={20} className="text-indigo-400" />
          <h1 className="text-white text-xl font-bold tracking-tight">My Analytics</h1>
        </div>
        <p className="text-slate-500 text-xs ml-8">
          {user?.full_name || user?.username}
        </p>
      </div>

      {/* ── Filter pills ── */}
      <div className="px-4 mb-5">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-none pb-1"
          role="group"
          aria-label="Date filter"
        >
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              aria-label={f.label}
              className={`flex-shrink-0 px-4 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-800 text-slate-400 border-slate-700 active:bg-slate-700'
              }`}
              style={{ minHeight: '44px' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Custom range pickers */}
        {filter === 'custom' && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              aria-label="Start date"
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ height: '44px', colorScheme: 'dark' }}
            />
            <span className="text-slate-500 text-sm flex-shrink-0">→</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={e => setCustomEnd(e.target.value)}
              aria-label="End date"
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ height: '44px', colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20" aria-label="Loading analytics">
          <Loader2 size={30} className="text-indigo-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="px-4 py-10 text-center text-red-400 text-sm">{error}</div>
      ) : !data ? (
        <div className="px-4 py-10 text-center text-slate-600 text-sm">
          Select a date range to view your stats
        </div>
      ) : (
        <div className="px-4 pb-8 space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2" role="list" aria-label="Summary metrics">
            {METRIC_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
              <div
                key={key}
                role="listitem"
                className={`rounded-2xl border ${bg} p-3 flex flex-col gap-1.5`}
              >
                <Icon size={15} className={color} aria-hidden="true" />
                <p className={`text-3xl font-extrabold leading-none ${color}`} aria-label={`${data[key] ?? 0} ${label}`}>
                  {data[key] ?? 0}
                </p>
                <p className="text-slate-400 text-[10px] font-medium leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {/* Daily breakdown chart — hidden for single-day view */}
          {!singleDay && (
            <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Daily Breakdown
              </h2>

              {!hasChartData ? (
                <div className="flex items-center justify-center py-12 text-slate-600 text-sm">
                  No activity in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={chartData}
                    barGap={2}
                    barCategoryGap="22%"
                    margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtTick}
                      tick={{ fill: '#64748b', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={22}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={v => (
                        <span style={{ color: '#94a3b8', fontSize: 10 }}>{v}</span>
                      )}
                    />
                    {BARS.map(b => (
                      <Bar
                        key={b.key}
                        dataKey={b.key}
                        name={b.name}
                        fill={b.fill}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={18}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Single-day breakdown (Today) */}
          {singleDay && chartData.length === 1 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Today's Breakdown
              </h2>
              <div className="space-y-3">
                {BARS.map(b => {
                  const val = chartData[0]?.[b.key] ?? 0
                  const pct = Math.min(100, val > 0 ? Math.max(8, (val / 10) * 100) : 0)
                  return (
                    <div key={b.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">{b.name}</span>
                        <span className="font-semibold" style={{ color: b.fill }}>{val}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: b.fill }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
