import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users,
  TrendingUp,
  UserCog, LogOut, Zap, MapPin, Search, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList,
} from 'lucide-react'

const ALL_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true, hideForTech: true },
  { to: '/contacts', label: 'Contacts', icon: Users, hideForTech: true },
  { to: '/deals', label: 'Deals', icon: TrendingUp, hideForTech: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/clock', label: 'Clock In/Out', icon: Timer },
  { to: '/chats', label: 'Chats', icon: MessageSquare, adminOnly: true, hideForTech: true },
  { to: '/map', label: 'My Map', icon: MapPin, hideForTech: true },
  { to: '/team-map', label: 'Team Map', icon: Globe, hideForTech: true },
  { to: '/search', label: 'Search', icon: Search, hideForTech: true },
  { to: '/timesheet', label: 'Timesheet', icon: ClipboardList, adminOnly: true },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = ALL_NAV.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false
    if (item.hideForTech && user?.role === 'technician') return false
    return true
  })

  function handleLogout() {
    logout()
    navigate('/login')
  }

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
        {navItems.map(({ to, label, icon: Icon, exact }) => (
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
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <NavLink
            to="/users"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <UserCog size={18} />
            Users
          </NavLink>
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
