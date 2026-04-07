import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Users, CheckCircle, DollarSign, CalendarDays } from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub, colorClass, iconClass, to }) {
  const inner = (
    <div className={`bg-slate-900 rounded-2xl border p-6 transition-colors ${colorClass}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${iconClass}`}>
        <Icon size={22} />
      </div>
      <p className="text-3xl font-bold text-slate-100 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
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

const JOB_COLORS = {
  todo:            'bg-indigo-900/40 text-indigo-300',
  payment_pending: 'bg-amber-900/40 text-amber-300',
  done:            'bg-emerald-900/40 text-emerald-300',
  cancelled:       'bg-slate-700 text-slate-400',
}

const JOB_LABELS = {
  todo: 'To Do', payment_pending: 'Payment Pending', done: 'Done', cancelled: 'Cancelled',
}

export default function Dashboard() {
  const [contacts, setContacts] = useState([])
  const [deals, setDeals]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/contacts/', { params: { limit: 500 } }),
      api.get('/deals/',    { params: { limit: 1000 } }),
    ]).then(([c, d]) => {
      setContacts(c.data)
      setDeals(d.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const totalLeads     = contacts.length
  const totalCustomers = contacts.filter(c => c.status === 'customer').length
  const totalDealValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)
  const amountMade     = totalDealValue * 0.30

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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Groupe WMB — business overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={loading ? '…' : totalLeads}
          sub="all contacts"
          colorClass="border-indigo-500/20 hover:border-indigo-500/40"
          iconClass="bg-indigo-500/10 text-indigo-400"
          to="/contacts"
        />
        <StatCard
          icon={CheckCircle}
          label="Customers"
          value={loading ? '…' : totalCustomers}
          sub="closed contacts"
          colorClass="border-emerald-500/20 hover:border-emerald-500/40"
          iconClass="bg-emerald-500/10 text-emerald-400"
          to="/contacts"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue Made"
          value={loading ? '…' : fmtMoney(amountMade)}
          sub={`30% of ${fmtMoney(totalDealValue)} total`}
          colorClass="border-emerald-500/20 hover:border-emerald-500/40"
          iconClass="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          icon={CalendarDays}
          label="Appointments"
          value={loading ? '…' : deals.filter(d => d.expected_close_date).length}
          sub={`${upcoming.length} upcoming`}
          colorClass="border-amber-500/20 hover:border-amber-500/40"
          iconClass="bg-amber-500/10 text-amber-400"
          to="/calendar"
        />
      </div>

      {/* Recent rows */}
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_COLORS[d.job_status] || JOB_COLORS.todo}`}>
                    {JOB_LABELS[d.job_status] || 'To Do'}
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
