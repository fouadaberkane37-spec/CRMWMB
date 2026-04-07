import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout() {
  return (
    <div className="flex bg-slate-950 overflow-hidden" style={{ height: '100dvh' }}>
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content — flex col so flex-1 children (like maps) fill correctly */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Scrollable wrapper for normal pages; maps override with flex-1 */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
          {/* Spacer so non-map content clears the bottom nav */}
          <div className="md:hidden flex-shrink-0" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom))' }} />
        </div>
      </main>

      {/* Bottom nav — mobile only */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
