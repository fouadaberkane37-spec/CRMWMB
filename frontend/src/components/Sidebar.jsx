import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, MapPin, CalendarDays, Briefcase, MessageSquare,
  Users, TrendingUp, Building2, Activity, Map, CalendarCheck,
  Clock, Timer, BarChart3, UserPlus, LogOut, Zap,
} from 'lucide-react'

// Admin sidebar: exactly 5 primary items
const ADMIN_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/map', label: 'Personal Map', icon: MapPin },
  { to: '/booking', label: 'Booking', icon: CalendarDays },
  { to: '/jobs', label: 'Job Assignment', icon: Briefcase },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

const SALES_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/booking', label: 'Booking', icon: CalendarDays },
  { to: '/calendar', label: 'Calendar', icon: CalendarCheck },
  { to: '/map', label: 'Knock Map', icon: MapPin },
  { to: '/new-numbers', label: 'New Numbers', icon: UserPlus },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

const TECH_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/tech-schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/clock-in', label: 'Clock In/Out', icon: Clock },
  { to: '/timesheet', label: 'Timesheet', icon: Timer },
  { to: '/map', label: 'Knock Map', icon: MapPin },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

function navForRole(role) {
  if (role === 'admin') return ADMIN_NAV
  if (role === 'technician') return TECH_NAV
  return SALES_NAV
}

export default function Sidebar() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch('/api/chats/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        setUnread(data.unread || 0)
      } catch {}
    }
    fetchUnread()
    const iv = setInterval(fetchUnread, 15000)
    return () => clearInterval(iv)
  }, [token])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const navItems = navForRole(user?.role)

  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg">CRM</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, exact, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <span className="relative">
              <Icon size={18} />
              {badge && unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}

        {/* Admin-only extras */}
        {user?.role === 'admin' && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Admin</span>
            </div>
            {[
              { to: '/contacts', label: 'Contacts', icon: Users },
              { to: '/companies', label: 'Companies', icon: Building2 },
              { to: '/deals', label: 'Deals', icon: TrendingUp },
              { to: '/team-map', label: 'Team Map', icon: Map },
              { to: '/calendar', label: 'Calendar', icon: CalendarCheck },
              { to: '/analytics', label: 'Analytics', icon: BarChart3 },
              { to: '/team-sales', label: 'Team Sales', icon: TrendingUp },
              { to: '/new-numbers', label: 'New Numbers', icon: UserPlus },
              { to: '/timesheet', label: 'Timesheet', icon: Timer },
              { to: '/users', label: 'Users', icon: Users },
            ].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="px-3 py-2 mb-1">
          <p className="text-white text-sm font-medium truncate">{user?.full_name || user?.username}</p>
          <p className="text-slate-400 text-xs truncate capitalize">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
