import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import {
  LayoutDashboard, CalendarDays, Briefcase, MessageSquare, Menu, X, LogOut,
  Users, Building2, TrendingUp, MapPin, Map, CalendarCheck, Clock, Timer,
  BarChart3, UserPlus, Activity, UserCog,
} from 'lucide-react'

// Primary 4 + More per role
const ADMIN_PRIMARY = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/booking', label: 'Booking', icon: CalendarDays },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

const ADMIN_MORE = [
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/deals', label: 'Deals', icon: TrendingUp },
  { to: '/map', label: 'Personal Map', icon: MapPin },
  { to: '/team-map', label: 'Team Map', icon: Map },
  { to: '/calendar', label: 'Calendar', icon: CalendarCheck },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/team-sales', label: 'Team Sales', icon: TrendingUp },
  { to: '/new-numbers', label: 'New Numbers', icon: UserPlus },
  { to: '/timesheet', label: 'Timesheet', icon: Timer },
  { to: '/activities', label: 'Activities', icon: Activity },
  { to: '/users', label: 'Users', icon: UserCog },
]

const SALES_PRIMARY = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/booking', label: 'Booking', icon: CalendarDays },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

const SALES_MORE = [
  { to: '/calendar', label: 'Calendar', icon: CalendarCheck },
  { to: '/map', label: 'Knock Map', icon: MapPin },
  { to: '/new-numbers', label: 'New Numbers', icon: UserPlus },
  { to: '/deals', label: 'Deals', icon: TrendingUp },
  { to: '/activities', label: 'Activities', icon: Activity },
]

const TECH_PRIMARY = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/tech-schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/clock-in', label: 'Clock In', icon: Clock },
  { to: '/chats', label: 'Messages', icon: MessageSquare, badge: true },
]

const TECH_MORE = [
  { to: '/timesheet', label: 'Timesheet', icon: Timer },
  { to: '/map', label: 'Knock Map', icon: MapPin },
]

function navForRole(role) {
  if (role === 'admin') return { primary: ADMIN_PRIMARY, more: ADMIN_MORE }
  if (role === 'technician') return { primary: TECH_PRIMARY, more: TECH_MORE }
  return { primary: SALES_PRIMARY, more: SALES_MORE }
}

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false)
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
    setShowMore(false)
    logout()
    navigate('/login')
  }

  const { primary, more } = navForRole(user?.role)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700/50 flex md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primary.map(({ to, label, icon: Icon, exact, badge }) => (
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
            <span className="relative">
              <Icon size={22} />
              {badge && unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
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
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl px-4 pt-4 overflow-y-auto"
            style={{
              maxHeight: '85vh',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-base">More</span>
              <button onClick={() => setShowMore(false)} className="text-slate-400 p-1">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-1">
              {more.map(({ to, label, icon: Icon }) => (
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
