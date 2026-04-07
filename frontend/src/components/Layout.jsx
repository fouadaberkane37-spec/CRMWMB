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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <Outlet />
        {/* Spacer on mobile so content isn't hidden under bottom nav */}
        <div className="md:hidden flex-shrink-0" style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }} />
      </main>

      {/* Bottom nav — mobile only */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
