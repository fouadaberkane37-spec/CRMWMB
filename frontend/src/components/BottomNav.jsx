import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, Users, BookOpen,
  Menu, MapPin, UserCog, LogOut, X, MessageSquare, Globe, CalendarDays,
  Timer, ClipboardList, TrendingUp, PhoneIncoming, BarChart2, Briefcase, Leaf, Receipt,
} from 'lucide-react'

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false)
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'ceo'
  const isTech  = user?.role === 'technician'
  const isSales = user?.role === 'sales' || user?.role === 'user'
  const isFouad = !isAdmin && (
    user?.username?.toLowerCase().includes('fouad') ||
    user?.full_name?.toLowerCase().includes('fouad')
  )
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isLandscape = pathname === '/landscape'

  // Primary tab items (always visible)
  const primaryNav = isTech
    ? [
        { to: '/calendar',      label: 'Calendar', icon: CalendarDays },
        { to: '/tech-schedule', label: 'Schedule', icon: ClipboardList },
        { to: '/clock',         label: 'Clock',    icon: Timer },
      ]
    : isAdmin
    ? [
        { to: '/',               label: 'Dashboard', icon: LayoutDashboard, exact: true },
        { to: '/booking',        label: 'Booking',   icon: BookOpen },
        { to: '/job-assignment', label: 'Jobs',      icon: Briefcase },
        { to: '/chats',          label: 'Messages',  icon: MessageSquare },
      ]
    : isSales
    ? [
        ...(isFouad ? [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }] : []),
        { to: '/map',        label: 'Map',       icon: MapPin },
        { to: '/booking',    label: 'Booking',   icon: BookOpen },
        { to: '/contacts',   label: 'Contacts',  icon: Users },
        ...(!isFouad ? [{ to: '/analytics', label: 'Analytics', icon: TrendingUp }] : []),
      ]
    : [
        { to: '/',           label: 'Dashboard', icon: LayoutDashboard, exact: true },
        { to: '/calendar',   label: 'Calendar',  icon: CalendarDays },
        { to: '/booking',    label: 'Booking',   icon: BookOpen },
        { to: '/map',        label: 'Map',       icon: MapPin },
        { to: '/contacts',   label: 'Contacts',  icon: Users },
      ]

  // More drawer items (role-specific)
  const moreNav = isAdmin
    ? [
        { to: '/',             label: 'Dashboard',      icon: LayoutDashboard },
        { to: '/analytics',    label: 'Analytics',      icon: TrendingUp },
        { to: '/contacts',     label: 'Contacts',       icon: Users },
        { to: '/calendar',     label: 'Calendar',       icon: CalendarDays },
        { to: '/map',          label: 'My Map',         icon: MapPin },
        { to: '/team-map',     label: 'Team Map',       icon: Globe },
        { to: '/booking',      label: 'Booking',        icon: BookOpen },
        { to: '/job-assignment', label: 'Job Assignment', icon: Briefcase },
        { to: '/landscape',    label: 'Landscape',      icon: Leaf },
        { to: '/chats',        label: 'Messages',       icon: MessageSquare },
        { to: '/team-sales',   label: 'Team Sales',     icon: BarChart2 },
        { to: '/client-jobs',  label: 'Client Jobs',    icon: Receipt },
        { to: '/timesheet',    label: 'Timesheet',      icon: ClipboardList },
        { to: '/new-numbers',  label: 'New Numbers',    icon: PhoneIncoming },
        { to: '/users',        label: 'Users',          icon: UserCog },
      ]
    : isSales
    ? [
        { to: '/',           label: 'Dashboard', icon: LayoutDashboard },
        { to: '/analytics',  label: 'Analytics', icon: TrendingUp },
        { to: '/calendar',   label: 'Calendar',  icon: CalendarDays },
        { to: '/team-map',   label: 'Team Map',  icon: Globe },
      ]
    : []

  function handleLogout() {
    setShowMore(false)
    logout()
    navigate('/login')
  }

  // Techs have no More drawer
  const showMoreBtn = !isTech && moreNav.length > 0

  return (
    <>
      <nav
        className={`backdrop-blur-md border-t flex flex-shrink-0 ${isLandscape ? 'bg-[#020805]/95 border-emerald-900/40' : 'bg-slate-900/95 border-slate-700/50'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primaryNav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? (isLandscape ? 'text-emerald-400' : 'text-indigo-400') : (isLandscape ? 'text-emerald-900' : 'text-slate-500')
              }`
            }
            style={{ minHeight: '68px', paddingTop: '12px', paddingBottom: '12px' }}
          >
            <Icon size={24} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </NavLink>
        ))}

        {showMoreBtn && (
          <button
            onClick={() => setShowMore(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${isLandscape ? 'text-emerald-900' : 'text-slate-500'}`}
            style={{ minHeight: '68px', paddingTop: '12px', paddingBottom: '12px' }}
          >
            <Menu size={24} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        )}
      </nav>

      {/* More drawer */}
      {showMore && createPortal(
        <div className="fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl px-4 pt-5 slide-up overflow-y-scroll"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)',
              maxHeight: 'calc(90vh - env(safe-area-inset-top))',
              overscrollBehavior: 'contain',
            }}
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
              {moreNav.map(({ to, label, icon: Icon }) => (
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
        </div>,
      document.body)}
    </>
  )
}
