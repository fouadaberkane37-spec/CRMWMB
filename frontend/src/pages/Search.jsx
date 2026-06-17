import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Search as SearchIcon, Users, Building2, TrendingUp, ArrowRight } from 'lucide-react'

const TYPE_META = {
  contact: { icon: Users, color: 'text-blue-400', route: '/contacts' },
  company: { icon: Building2, color: 'text-indigo-400', route: '/companies' },
  deal: { icon: TrendingUp, color: 'text-emerald-400', route: '/deals' },
}

const SECTION_LABELS = { contacts: 'Contacts', companies: 'Companies', deals: 'Deals' }

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const timer = useRef(null)

  const runSearch = useCallback((q) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search/', { params: { q } })
        setResults(data)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  function handleChange(e) {
    setQuery(e.target.value)
    runSearch(e.target.value)
  }

  const totalResults = results
    ? Object.values(results).reduce((n, arr) => n + arr.length, 0)
    : 0

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Search</h1>
        <p className="text-slate-500 text-sm mt-0.5">Search across contacts, companies, and deals</p>
      </div>

      {/* Search input */}
      <div className="relative mb-6">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={handleChange}
          placeholder="Type to search…"
          className="w-full pl-11 pr-4 py-3.5 text-base border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {totalResults === 0 && (
            <div className="text-center py-12 text-slate-500">
              No results for <span className="text-slate-300">"{query}"</span>
            </div>
          )}

          {Object.entries(results).map(([section, items]) => {
            if (items.length === 0) return null
            return (
              <div key={section}>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {SECTION_LABELS[section]}
                </h2>
                <div className="bg-slate-900 rounded-xl border border-slate-700/50 divide-y divide-slate-700/30 overflow-hidden">
                  {items.map((item) => {
                    const meta = TYPE_META[item.type]
                    const Icon = meta.icon
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => navigate(meta.route)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800 active:bg-slate-800 transition-colors text-left"
                      >
                        <div className={`flex-shrink-0 ${meta.color}`}>
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{item.label}</p>
                          {item.sub && <p className="text-xs text-slate-500 truncate">{item.sub}</p>}
                        </div>
                        <ArrowRight size={14} className="text-slate-600 flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!results && !loading && (
        <div className="text-center py-16 text-slate-600">
          <SearchIcon size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Start typing to search</p>
        </div>
      )}
    </div>
  )
}
