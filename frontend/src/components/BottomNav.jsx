import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, TrendingUp, Search,
  Menu, MapPin, UserCog, LogOut, X, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList,
} from 'lucide-react'

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false)
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isTech  = user?.role === 'technician'
  const navigate = useNavigate()

  const primaryNav = isTech
    ? [
        { to: '/calendar',  label: 'Calendar',    icon: CalendarDays },
        { to: '/clock',     label: 'Clock In/Out', icon: Timer },
      ]
    : [
        { to: '/',          label: 'Dashboard', icon: LayoutDashboard, exact: true },
        { to: '/contacts',  label: 'Contacts',  icon: Users },
        { to: '/calendar',  label: 'Calendar',  icon: CalendarDays },
        { to: '/clock',     label: 'Clock',     icon: Timer },
        { to: '/search',    label: 'Search',    icon: Search },
      ]

  function handleLogout() {
    setShowMore(false)
    logout()
    navigate('/login')
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primaryNav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-500'
              }`
            }
            style={{ minHeight: '56px', paddingTop: '8px', paddingBottom: '8px' }}
          >
            <Icon size={24} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </NavLink>
        ))}

        {!isTech && (
          <button
            onClick={() => setShowMore(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500"
            style={{ minHeight: '56px', paddingTop: '8px', paddingBottom: '8px' }}
          >
            <Menu size={24} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        )}
      </nav>

      {/* More drawer */}
      {showMore && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl px-4 pt-5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-5" />

            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold text-base">More</span>
              <button
                onClick={() => setShowMore(false)}
                className="text-slate-400 flex items-center justify-center rounded-full bg-slate-800"
                style={{ width: '36px', height: '36px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              {[
                { to: '/deals',     label: 'Deals',      icon: TrendingUp },
                { to: '/map',       label: 'My Map',     icon: MapPin },
                { to: '/team-map',  label: 'Team Map',   icon: Globe },
                ...(isAdmin ? [{ to: '/chats',     label: 'Chats',      icon: MessageSquare }] : []),
                ...(isAdmin ? [{ to: '/timesheet', label: 'Timesheet',  icon: ClipboardList }] : []),
                ...(isAdmin ? [{ to: '/users',     label: 'Users',      icon: UserCog }] : []),
              ].map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 rounded-xl text-sm font-medium transition-colors ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 active:bg-slate-800'
                    }`
                  }
                  style={{ minHeight: '52px' }}
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}

              <div className="border-t border-slate-700/50 mt-3 pt-3">
                <div className="px-4 py-2">
                  <p className="text-white text-sm font-semibold">{user?.full_name || user?.username}</p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">{user?.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 rounded-xl text-sm font-medium text-red-400 active:bg-slate-800"
                  style={{ minHeight: '52px' }}
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
