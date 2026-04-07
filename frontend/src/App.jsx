import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Contacts from './pages/Contacts.jsx'
import Deals from './pages/Deals.jsx'
import Users from './pages/Users.jsx'
import KnockMap from './pages/KnockMap.jsx'
import TeamMap from './pages/TeamMap.jsx'
import Search from './pages/Search.jsx'
import Chats from './pages/Chats.jsx'
import AcceptInvite from './pages/AcceptInvite.jsx'
import Calendar from './pages/Calendar.jsx'
import ClockInOut from './pages/ClockInOut.jsx'
import Timesheet from './pages/Timesheet.jsx'

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// Redirects non-admin users away from admin-only routes
function RequireAdmin({ children }) {
  const { user } = useAuth()
  return user?.role === 'admin' ? children : <Navigate to="/" replace />
}

function DesktopBlock() {
  const url = window.location.origin
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-6 text-4xl font-black text-white">W</div>
        <h1 className="text-2xl font-bold text-white mb-2">WMB CRM</h1>
        <p className="text-slate-400 text-sm mb-8">This app is designed for mobile use. Open it on your phone to get started.</p>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 inline-block mb-6">
          {/* QR code rendered via Google Charts API — no library needed */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=1e293b&color=ffffff&data=${encodeURIComponent(url)}`}
            alt="QR code to open on phone"
            width={180}
            height={180}
            className="rounded-lg"
          />
        </div>
        <p className="text-slate-600 text-xs">Scan with your phone camera</p>
        <p className="text-slate-700 text-xs mt-1 break-all">{url}</p>
      </div>
    </div>
  )
}

function MobileGate({ children }) {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768
  if (!isMobile) return <DesktopBlock />
  return children
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('token'))

  function login(userData, accessToken) {
    setUser(userData)
    setToken(accessToken)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('token', accessToken)
  }

  function logout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  return (
    <MobileGate>
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="deals" element={<Deals />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="users" element={<Users />} />
            <Route path="map" element={<KnockMap />} />
            <Route path="team-map" element={<TeamMap />} />
            <Route path="search" element={<Search />} />
            <Route path="chats" element={<RequireAdmin><Chats /></RequireAdmin>} />
            <Route path="clock" element={<ClockInOut />} />
            <Route path="timesheet" element={<RequireAdmin><Timesheet /></RequireAdmin>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
    </MobileGate>
  )
}
