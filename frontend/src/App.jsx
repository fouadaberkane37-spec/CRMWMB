import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Contacts from './pages/Contacts.jsx'
import Booking from './pages/Booking.jsx'
import Users from './pages/Users.jsx'
import KnockMap from './pages/KnockMap.jsx'
import TeamMap from './pages/TeamMap.jsx'
import Search from './pages/Search.jsx'
import Chats from './pages/Chats.jsx'
import AcceptInvite from './pages/AcceptInvite.jsx'
import Calendar from './pages/Calendar.jsx'
import ClockInOut from './pages/ClockInOut.jsx'
import Timesheet from './pages/Timesheet.jsx'
import Analytics from './pages/Analytics.jsx'
import NewNumbers from './pages/NewNumbers.jsx'
import TeamSales from './pages/TeamSales.jsx'
import TechSchedule from './pages/TechSchedule.jsx'
import JobAssignment from './pages/JobAssignment.jsx'
import LandscapePipeline from './pages/LandscapePipeline.jsx'

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// Redirects non-admin/non-CEO users away from admin-only routes
function RequireAdmin({ children }) {
  const { user } = useAuth()
  return (user?.role === 'admin' || user?.role === 'ceo') ? children : <Navigate to="/" replace />
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
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={
            user?.role === 'technician'
              ? <Navigate to="/calendar" replace />
              : <Dashboard />
          } />
            <Route path="contacts" element={<Contacts />} />
            <Route path="booking" element={<Booking />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="users" element={<Users />} />
            <Route path="map" element={<KnockMap />} />
            <Route path="team-map" element={<TeamMap />} />
            <Route path="search" element={<Search />} />
            <Route path="chats" element={<RequireAdmin><Chats /></RequireAdmin>} />
            <Route path="clock" element={<ClockInOut />} />
            <Route path="timesheet" element={<RequireAdmin><Timesheet /></RequireAdmin>} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="new-numbers" element={<RequireAdmin><NewNumbers /></RequireAdmin>} />
            <Route path="team-sales" element={<RequireAdmin><TeamSales /></RequireAdmin>} />
            <Route path="tech-schedule" element={<TechSchedule />} />
            <Route path="job-assignment" element={<RequireAdmin><JobAssignment /></RequireAdmin>} />
            <Route path="landscape" element={<RequireAdmin><LandscapePipeline /></RequireAdmin>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
