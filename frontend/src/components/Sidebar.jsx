import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, BookOpen,
  UserCog, LogOut, Zap, MapPin, Search, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList, TrendingUp, PhoneIncoming, BarChart2, Briefcase,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'Sales',
    items: [
      { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, exact: true, hideForTech: true },
      { to: '/contacts',   label: 'Contacts',    icon: Users,           hideForTech: true },
      { to: '/booking',    label: 'Booking',     icon: BookOpen,        hideForTech: true },
      { to: '/analytics',  label: 'Analytics',   icon: TrendingUp,      hideForTech: true },
      { to: '/team-sales', label: 'Team Sales',  icon: BarChart2,       adminOnly: true },
      { to: '/new-numbers',label: 'New Numbers', icon: PhoneIncoming,   adminOnly: true },
    ],
  },
  {
    label: 'Customer Service',
    items: [
      { to: '/chats',    label: 'Chats',    icon: MessageSquare, chatsOnly: true, hideForTech: true },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/search',   label: 'Search',   icon: Search,        hideForTech: true },
      { to: '/map',      label: 'My Map',   icon: MapPin,        hideForTech: true },
      { to: '/team-map', label: 'Team Map', icon: Globe,         hideForTech: true },
    ],
  },
  {
    label: 'Technician Management',
    items: [
      { to: '/job-assignment', label: 'Job Assignment', icon: Briefcase,    adminOnly: true },
      { to: '/timesheet',      label: 'Timesheet',      icon: ClipboardList, adminOnly: true },
      { to: '/clock',          label: 'Clock In/Out',   icon: Timer,         hideForSales: true },
      { to: '/tech-schedule',  label: 'My Schedule',    icon: ClipboardList, techOnly: true },
      { to: '/users',          label: 'Users',          icon: UserCog,       adminOnly: true },
    ],
  },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const canSeeChats = user?.role === 'admin' ||
    user?.username?.toLowerCase().includes('fouad') ||
    user?.full_name?.toLowerCase().includes('fouad')

  function isVisible(item) {
    if (item.adminOnly  && user?.role !== 'admin')       return false
    if (item.techOnly   && user?.role !== 'technician')  return false
    if (item.chatsOnly  && !canSeeChats)                 return false
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
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {NAV_GROUPS.map(group => {
          const visible = group.items.filter(isVisible)
          if (!visible.length) return null
          return (
            <div key={group.label}>
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
        })}
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
