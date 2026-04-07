import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Users, UserCheck, DollarSign, CalendarDays } from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub, color, to }) {
  const palette = {
    indigo:  { card: 'border-indigo-500/20 hover:border-indigo-500/40',  icon: 'bg-indigo-500/10 text-indigo-400'  },
    emerald: { card: 'border-emerald-500/20 hover:border-emerald-500/40', icon: 'bg-emerald-500/10 text-emerald-400' },
    green:   { card: 'border-green-500/20 hover:border-green-500/40',    icon: 'bg-green-500/10 text-green-400'    },
    amber:   { card: 'border-amber-500/20 hover:border-amber-500/40',    icon: 'bg-amber-500/10 text-amber-400'    },
  }
  const p = palette[color] || palette.indigo

  const inner = (
    <div className={`bg-slate-900 rounded-2xl border p-6 transition-colors ${p.card}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${p.icon}`}>
        <Icon size={22} />
      </div>
      <p className="text-3xl font-bold text-slate-100 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      <p className="text-sm text-slate-400 mt-2 font-medium">{label}</p>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

const STATUS_COLORS = {
  lead:     'bg-blue-900/40 text-blue-400',
  prospect: 'bg-yellow-900/40 text-yellow-400',
  customer: 'bg-emerald-900/40 text-emerald-400',
  inactive: 'bg-slate-700 text-slate-400',
}

const JOB_STATUS_COLORS = {
  todo:            'bg-indigo-900/40 text-indigo-400',
  payment_pending: 'bg-amber-900/40 text-amber-400',
  done:            'bg-emerald-900/40 text-emerald-400',
  cancelled:       'bg-slate-700 text-slate-400',
}

const JOB_STATUS_LABELS = {
  todo: 'To Do', payment_pending: 'Payment Pending', done: 'Done', cancelled: 'Cancelled',
}

export default function Dashboard() {
  const [contacts, setContacts] = useState([])
  const [deals, setDeals]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/contacts/?limit=200'),
      api.get('/deals/?limit=1000'),
    ]).then(([c, d]) => {
      setContacts(c.data)
      setDeals(d.data)
    }).finally(() => setLoading(false))
  }, [])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalLeads     = contacts.length
  const totalCustomers = contacts.filter(c => c.status === 'customer').length
  const totalDealValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)
  const amountMade     = totalDealValue * 0.30   // 30% margin

  // Upcoming appointments (deals with a future date)
  const now = new Date()
  const upcoming = deals
    .filter(d => d.expected_close_date && new Date(d.expected_close_date) >= now)
    .sort((a, b) => new Date(a.expected_close_date) - new Date(b.expected_close_date))
    .slice(0, 5)

  const recentContacts = [...contacts]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  function fmtMoney(n) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
    return `$${n.toFixed(0)}`
  }

  function fmtDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Groupe WMB — business overview</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={loading ? '…' : totalLeads}
          sub="all contacts"
          color="indigo"
          to="/contacts"
        />
        <StatCard
          icon={UserCheck}
          label="Customers"
          value={loading ? '…' : totalCustomers}
          sub="closed contacts"
          color="emerald"
          to="/contacts"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue Made"
          value={loading ? '…' : fmtMoney(amountMade)}
          sub={`30% of ${fmtMoney(totalDealValue)} total`}
          color="green"
        />
        <StatCard
          icon={CalendarDays}
          label="Appointments"
          value={loading ? '…' : deals.filter(d => d.expected_close_date).length}
          sub={`${upcoming.length} upcoming`}
          color="amber"
          to="/calendar"
        />
      </div>

      {/* ── Recent rows ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Contacts */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-100">Recent Contacts</h2>
            <Link to="/contacts" className="text-sm text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>
          <div className="divide-y divide-slate-700/30">
            {recentContacts.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 text-sm">No contacts yet</p>
            )}
            {recentContacts.map((c) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-slate-500">{c.phone || c.address || '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-700 text-slate-400'}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700/50">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-100">Upcoming Appointments</h2>
            <Link to="/calendar" className="text-sm text-indigo-400 hover:text-indigo-300">Calendar</Link>
          </div>
          <div className="divide-y divide-slate-700/30">
            {upcoming.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 text-sm">No upcoming appointments</p>
            )}
            {upcoming.map((d) => (
              <div key={d.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {d.contact ? `${d.contact.first_name} ${d.contact.last_name || ''}`.trim() : d.title}
                  </p>
                  <p className="text-xs text-slate-500">{fmtDate(d.expected_close_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-400">{d.value > 0 ? `$${d.value.toFixed(0)}` : '—'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_STATUS_COLORS[d.job_status] || JOB_STATUS_COLORS.todo}`}>
                    {JOB_STATUS_LABELS[d.job_status] || 'To Do'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
