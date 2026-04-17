import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Users, CheckCircle, DollarSign, CalendarDays, ChevronRight, UserPlus, Clock } from 'lucide-react'

const STATUS_COLORS = {
  lead:     'bg-blue-900/40 text-blue-400',
  prospect: 'bg-yellow-900/40 text-yellow-400',
  customer: 'bg-emerald-900/40 text-emerald-400',
  inactive: 'bg-slate-700 text-slate-400',
}

const JOB_COLORS = {
  todo:            'bg-indigo-900/40 text-indigo-300',
  payment_pending: 'bg-amber-900/40 text-amber-300',
  done:            'bg-emerald-900/40 text-emerald-300',
  cancelled:       'bg-slate-700 text-slate-400',
}

const JOB_LABELS = {
  todo: 'To Do', payment_pending: 'Pending', done: 'Done', cancelled: 'Cancelled',
}

function StatCard({ icon: Icon, label, value, sub, accent, to }) {
  const inner = (
    <div className={`bg-slate-900 rounded-2xl border ${accent.border} p-4 active:opacity-80 transition-opacity`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent.icon}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-slate-100 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      <p className="text-xs text-slate-400 mt-2 font-medium">{label}</p>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

export default function Dashboard() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  const [deals, setDeals]       = useState([])
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/contacts/', { params: { limit: 500 } }),
      api.get('/deals/',    { params: { limit: 1000 } }),
      api.get('/dashboard/stats'),
    ]).then(([c, d, s]) => {
      setContacts(c.data)
      setDeals(d.data)
      setStats(s.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const myDeals        = deals.filter(d => d.created_by === user?.id || d.assigned_to === user?.id)
  const totalLeads     = contacts.length
  const totalCustomers = contacts.filter(c => c.status === 'customer').length
  const amountMade     = stats?.revenue_made ?? 0

  const now = new Date()
  const upcoming = myDeals
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
    <div className="px-4 pt-6 pb-2 md:px-8 md:pt-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-100">
          Hey, {user?.full_name?.split(' ')[0] || user?.username} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Groupe WMB overview</p>
      </div>

      {/* Stats 2×2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={loading ? '…' : totalLeads}
          sub="all contacts"
          accent={{ border: 'border-indigo-500/20', icon: 'bg-indigo-500/10 text-indigo-400' }}
          to="/contacts"
        />
        <StatCard
          icon={CheckCircle}
          label="Customers"
          value={loading ? '…' : totalCustomers}
          sub="closed"
          accent={{ border: 'border-emerald-500/20', icon: 'bg-emerald-500/10 text-emerald-400' }}
          to="/contacts"
        />
        <StatCard
          icon={DollarSign}
          label="Profit"
          value={loading ? '…' : fmtMoney(amountMade)}
          accent={{ border: 'border-emerald-500/20', icon: 'bg-emerald-500/10 text-emerald-400' }}
        />
        <StatCard
          icon={CalendarDays}
          label="Appointments"
          value={loading ? '…' : myDeals.filter(d => d.expected_close_date).length}
          sub={`${upcoming.length} upcoming`}
          accent={{ border: 'border-amber-500/20', icon: 'bg-amber-500/10 text-amber-400' }}
          to="/calendar"
        />
      </div>

      {/* Recent Contacts */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 mb-4 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100 text-sm">Recent Contacts</h2>
          <Link to="/contacts" className="flex items-center gap-1 text-xs text-indigo-400">
            View all <ChevronRight size={14} />
          </Link>
        </div>
        <div className="divide-y divide-slate-700/30">
          {loading && (
            <div className="divide-y divide-slate-700/30">
              {[1,2,3].map(i => (
                <div key={i} className="px-4 flex items-center gap-3" style={{ minHeight: '52px' }}>
                  <div className="w-8 h-8 rounded-full bg-slate-800 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-800 rounded animate-pulse w-32" />
                    <div className="h-2.5 bg-slate-800 rounded animate-pulse w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && recentContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-600">
              <UserPlus size={28} className="opacity-40" />
              <p className="text-sm">No contacts yet</p>
            </div>
          )}
          {recentContacts.map(c => (
            <div key={c.id} className="px-4 flex items-center justify-between" style={{ minHeight: '52px' }}>
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-slate-200 truncate">{c.first_name} {c.last_name}</p>
                <p className="text-xs text-slate-500 truncate">{c.phone || c.address || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${STATUS_COLORS[c.status] || 'bg-slate-700 text-slate-400'}`}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100 text-sm">Upcoming Appointments</h2>
          <Link to="/calendar" className="flex items-center gap-1 text-xs text-indigo-400">
            Calendar <ChevronRight size={14} />
          </Link>
        </div>
        <div className="divide-y divide-slate-700/30">
          {!loading && upcoming.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-600">
              <Clock size={28} className="opacity-40" />
              <p className="text-sm">No upcoming appointments</p>
            </div>
          )}
          {upcoming.map(d => (
            <div key={d.id} className="px-4 flex items-center justify-between" style={{ minHeight: '56px' }}>
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {d.contact ? `${d.contact.first_name} ${d.contact.last_name || ''}`.trim() : d.title}
                </p>
                <p className="text-xs text-slate-500">{fmtDate(d.expected_close_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-emerald-400">{d.value > 0 ? `$${d.value.toFixed(0)}` : '—'}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${JOB_COLORS[d.job_status] || JOB_COLORS.todo}`}>
                  {JOB_LABELS[d.job_status] || 'To Do'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
