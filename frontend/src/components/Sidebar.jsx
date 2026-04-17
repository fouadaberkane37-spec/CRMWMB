import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, BookOpen,
  UserCog, LogOut, Zap, MapPin, Search, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList, TrendingUp, PhoneIncoming, BarChart2, Briefcase,
} from 'lucide-react'
import api from '../api.js'

// ── Admin-only nav (exactly 5 items) ──────────────────────────────────────────
const ADMIN_NAV = [
  { to: '/',               label: 'Dashboard',      icon: LayoutDashboard, exact: true },
  { to: '/map',            label: 'Personal Map',   icon: MapPin },
  { to: '/booking',        label: 'Booking',        icon: BookOpen },
  { to: '/job-assignment', label: 'Job Assignment', icon: Briefcase },
  { to: '/chats',          label: 'Messages',       icon: MessageSquare, badge: true },
]

// ── Non-admin nav (unchanged) ──────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Sales',
    items: [
      { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, exact: true, hideForTech: true },
      { to: '/contacts',   label: 'Contacts',    icon: Users,           hideForTech: true },
      { to: '/booking',    label: 'Booking',     icon: BookOpen,        hideForTech: true },
      { to: '/analytics',  label: 'Analytics',   icon: TrendingUp,      hideForTech: true },
    ],
  },
  {
    label: 'Customer Service',
    items: [
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/search',   label: 'Search',   icon: Search,        hideForTech: true },
      { to: '/map',      label: 'My Map',   icon: MapPin,        hideForTech: true },
      { to: '/team-map', label: 'Team Map', icon: Globe,         hideForTech: true },
    ],
  },
  {
    label: 'Technician Management',
    items: [
      { to: '/clock',         label: 'Clock In/Out', icon: Timer,         hideForSales: true },
      { to: '/tech-schedule', label: 'My Schedule',  icon: ClipboardList, techOnly: true },
    ],
  },
]

function useUnreadCount(isAdmin) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    let active = true

    function poll() {
      api.get('/chats/unread-count').then(r => {
        if (active) setUnread(r.data.unread || 0)
      }).catch(() => {})
    }

    poll()
    const id = setInterval(poll, 15000)
    return () => { active = false; clearInterval(id) }
  }, [isAdmin])

  return unread
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const unread = useUnreadCount(isAdmin)

  function isVisible(item) {
    if (item.techOnly   && user?.role !== 'technician')  return false
    if (item.hideForTech  && user?.role === 'technician') return false
    if (item.hideForSales && (user?.role === 'sales' || user?.role === 'user')) return false
    return true
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`

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
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {isAdmin ? (
          ADMIN_NAV.map(({ to, label, icon: Icon, exact, badge }) => (
            <NavLink key={to} to={to} end={exact} className={linkClass}>
              <div className="relative">
                <Icon size={17} />
                {badge && unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              {label}
            </NavLink>
          ))
        ) : (
          NAV_GROUPS.map(group => {
            const visible = group.items.filter(isVisible)
            if (!visible.length) return null
            return (
              <div key={group.label} className="mb-4">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {visible.map(({ to, label, icon: Icon, exact }) => (
                    <NavLink key={to} to={to} end={exact} className={linkClass}>
                      <Icon size={17} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="px-3 py-2 mb-1">
          <p className="text-white text-sm font-medium truncate">{user?.full_name || user?.username}</p>
          <p className="text-slate-400 text-xs truncate capitalize">{user?.role}</p>
        </div>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
