import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      {/* Main content — extra bottom padding on mobile for bottom nav; map pages get full height */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 flex flex-col">
        <Outlet />
      </main>
      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
  )
}
