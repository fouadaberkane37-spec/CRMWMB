import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, TrendingUp, Search,
  Menu, Building2, MapPin, UserCog, LogOut, X, Activity, MessageSquare,
} from 'lucide-react'

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/chats', label: 'Chats', icon: MessageSquare },
  { to: '/deals', label: 'Deals', icon: TrendingUp },
  { to: '/search', label: 'Search', icon: Search },
]

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    setShowMore(false)
    logout()
    navigate('/login')
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700/50 flex md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primaryNav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-500'
              }`
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}

        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-slate-500"
        >
          <Menu size={22} />
          <span>More</span>
        </button>
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl px-4 pt-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-base">More</span>
              <button onClick={() => setShowMore(false)} className="text-slate-400 p-1">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-1">
              {[
                { to: '/activities', label: 'Activities', icon: Activity },
                { to: '/companies', label: 'Companies', icon: Building2 },
                { to: '/map', label: 'Knock Map', icon: MapPin },
                ...(user?.role === 'admin' ? [{ to: '/users', label: 'Users', icon: UserCog }] : []),
              ].map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 active:bg-slate-800'
                    }`
                  }
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}

              <div className="border-t border-slate-700/50 mt-2 pt-2">
                <div className="px-4 py-2">
                  <p className="text-white text-sm font-medium">{user?.full_name || user?.username}</p>
                  <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-medium text-red-400 active:bg-slate-800"
                >
                  <LogOut size={20} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
