import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout() {
  return (
    // Outer: full screen, vertical flex on mobile, horizontal on desktop
    <div className="flex flex-col md:flex-row bg-slate-950 overflow-hidden" style={{ height: '100dvh' }}>

      {/* Sidebar — desktop only (horizontal sibling) */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Content area — fills remaining space, scrollable */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only (stacked below content) */}
      <div className="md:hidden flex-shrink-0">
        <BottomNav />
      </div>

    </div>
  )
}
