import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, BookOpen,
  UserCog, LogOut, Zap, MapPin, Search, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList, TrendingUp, PhoneIncoming, BarChart2, Briefcase, Leaf,
} from 'lucide-react'
import api from '../api.js'

const ADMIN_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/',          label: 'Dashboard',  icon: LayoutDashboard, exact: true },
      { to: '/analytics', label: 'Analytics',  icon: TrendingUp },
      { to: '/contacts',  label: 'Contacts',   icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/booking',        label: 'Booking',        icon: BookOpen },
      { to: '/calendar',       label: 'Calendar',       icon: CalendarDays },
      { to: '/landscape',      label: 'Landscape',      icon: Leaf },
      { to: '/job-assignment', label: 'Job Assignment', icon: Briefcase },
    ],
  },
  {
    label: 'Maps & Leads',
    items: [
      { to: '/map',         label: 'My Map',      icon: MapPin },
      { to: '/team-map',    label: 'Team Map',    icon: Globe },
      { to: '/new-numbers', label: 'New Numbers', icon: PhoneIncoming },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/chats',      label: 'Messages',   icon: MessageSquare, badge: true },
      { to: '/team-sales', label: 'Team Sales', icon: BarChart2 },
      { to: '/timesheet',  label: 'Timesheet',  icon: ClipboardList },
      { to: '/users',      label: 'Users',      icon: UserCog },
    ],
  },
]

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
  const { pathname } = useLocation()
  const isAdmin = user?.role === 'admin'
  const isLandscape = pathname === '/landscape'
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
        ? (isLandscape ? 'bg-emerald-800/60 text-emerald-200' : 'bg-indigo-600 text-white')
        : (isLandscape ? 'text-emerald-700 hover:text-emerald-200 hover:bg-emerald-900/40' : 'text-slate-400 hover:text-white hover:bg-slate-800')
    }`

  return (
    <aside className={`w-60 flex-shrink-0 flex flex-col h-full ${isLandscape ? 'bg-[#020805]' : 'bg-slate-900'}`}>
      {/* Logo */}
      <div className={`px-6 py-5 border-b ${isLandscape ? 'border-emerald-900/30' : 'border-slate-700/50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLandscape ? 'bg-emerald-800' : 'bg-indigo-500'}`}>
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg">CRM</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {isAdmin ? (
          ADMIN_NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <p className={`px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest ${isLandscape ? 'text-emerald-900' : 'text-slate-600'}`}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, exact, badge }) => (
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
                ))}
              </div>
            </div>
          ))
        ) : (
          NAV_GROUPS.map(group => {
            const visible = group.items.filter(isVisible)
            if (!visible.length) return null
            return (
              <div key={group.label} className="mb-4">
                <p className={`px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest ${isLandscape ? 'text-emerald-900' : 'text-slate-600'}`}>
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
      <div className={`px-3 py-4 border-t ${isLandscape ? 'border-emerald-900/30' : 'border-slate-700/50'}`}>
        <div className="px-3 py-2 mb-1">
          <p className="text-white text-sm font-medium truncate">{user?.full_name || user?.username}</p>
          <p className={`text-xs truncate capitalize ${isLandscape ? 'text-emerald-700' : 'text-slate-400'}`}>{user?.role}</p>
        </div>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isLandscape ? 'text-emerald-700 hover:text-emerald-200 hover:bg-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
