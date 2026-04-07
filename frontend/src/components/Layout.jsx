import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout() {
  return (
    <div
      className="flex flex-col md:flex-row bg-slate-950"
      style={{ height: '100dvh' }}
    >
      {/* Top safe area (notch / Dynamic Island) — mobile only */}
      <div
        className="md:hidden flex-shrink-0 bg-slate-950"
        style={{ height: 'env(safe-area-inset-top)' }}
      />

      {/* Horizontal row: sidebar (desktop) + content */}
      <div className="flex flex-1 min-h-0 md:flex-row">
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex flex-shrink-0">
          <Sidebar />
        </div>

        {/* Main scrollable content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <Outlet />
          {/* Bottom padding so last item clears the nav */}
          <div className="md:hidden" style={{ height: '1rem' }} />
        </main>
      </div>

      {/* Bottom nav — mobile only (always at bottom, respects home indicator) */}
      <div className="md:hidden flex-shrink-0">
        <BottomNav />
      </div>
    </div>
  )
}
