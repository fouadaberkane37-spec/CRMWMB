import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Users, Building2, TrendingUp, DollarSign, CheckCircle, Activity } from 'lucide-react'

function StatCard({ icon: Icon, label, value, color, to }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }
  const card = (
    <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentContacts, setRecentContacts] = useState([])
  const [recentDeals, setRecentDeals] = useState([])

  useEffect(() => {
    api.get('/dashboard/stats').then((r) => setStats(r.data))
    api.get('/contacts?limit=5').then((r) => setRecentContacts(r.data))
    api.get('/deals?limit=5').then((r) => setRecentDeals(r.data))
  }, [])

  const fmt = (n) =>
    n >= 1000000
      ? `$${(n / 1000000).toFixed(1)}M`
      : n >= 1000
      ? `$${(n / 1000).toFixed(0)}K`
      : `$${n}`

  const stageColors = {
    lead: 'bg-blue-100 text-blue-700',
    qualified: 'bg-indigo-100 text-indigo-700',
    proposal: 'bg-purple-100 text-purple-700',
    negotiation: 'bg-orange-100 text-orange-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-700',
  }

  const statusColors = {
    lead: 'bg-blue-100 text-blue-700',
    prospect: 'bg-yellow-100 text-yellow-700',
    customer: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Your CRM overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard icon={Users} label="Contacts" value={stats?.total_contacts ?? '—'} color="indigo" to="/contacts" />
        <StatCard icon={Building2} label="Companies" value={stats?.total_companies ?? '—'} color="blue" to="/companies" />
        <StatCard icon={TrendingUp} label="Open Deals" value={stats?.open_deals ?? '—'} color="violet" to="/deals" />
        <StatCard icon={DollarSign} label="Pipeline Value" value={stats ? fmt(stats.total_deal_value) : '—'} color="emerald" />
        <StatCard icon={CheckCircle} label="Won Deals" value={stats?.won_deals ?? '—'} color="amber" />
        <StatCard icon={Activity} label="Today's Activity" value={stats?.activities_today ?? '—'} color="rose" to="/activities" />
      </div>

      {/* Recent rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Contacts */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Contacts</h2>
            <Link to="/contacts" className="text-sm text-indigo-600 hover:text-indigo-700">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentContacts.length === 0 && (
              <p className="px-6 py-8 text-center text-gray-400 text-sm">No contacts yet</p>
            )}
            {recentContacts.map((c) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="text-xs text-gray-400">{c.email || c.company?.name || '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Deals */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Deals</h2>
            <Link to="/deals" className="text-sm text-indigo-600 hover:text-indigo-700">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentDeals.length === 0 && (
              <p className="px-6 py-8 text-center text-gray-400 text-sm">No deals yet</p>
            )}
            {recentDeals.map((d) => (
              <div key={d.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.title}</p>
                  <p className="text-xs text-gray-400">{d.contact ? `${d.contact.first_name} ${d.contact.last_name || ''}` : '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{d.value > 0 ? fmt(d.value) : '—'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${stageColors[d.stage] || 'bg-gray-100 text-gray-600'}`}>
                    {d.stage}
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
