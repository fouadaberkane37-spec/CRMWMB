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
      {/* Main content — bottom padding accounts for nav bar + iOS safe area */}
      <main
        className="flex-1 overflow-y-auto flex flex-col md:pb-0"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      {/* Bottom nav — mobile only */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
