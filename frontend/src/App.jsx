import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Contacts from './pages/Contacts.jsx'
import Companies from './pages/Companies.jsx'
import Deals from './pages/Deals.jsx'
import Activities from './pages/Activities.jsx'
import Users from './pages/Users.jsx'
import KnockMap from './pages/KnockMap.jsx'
import TeamMap from './pages/TeamMap.jsx'
import Booking from './pages/Booking.jsx'
import Calendar from './pages/Calendar.jsx'
import Chats from './pages/Chats.jsx'
import JobAssignment from './pages/JobAssignment.jsx'
import TechSchedule from './pages/TechSchedule.jsx'
import ClockInOut from './pages/ClockInOut.jsx'
import Timesheet from './pages/Timesheet.jsx'
import Analytics from './pages/Analytics.jsx'
import TeamSales from './pages/TeamSales.jsx'
import NewNumbers from './pages/NewNumbers.jsx'

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
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
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="companies" element={<Companies />} />
            <Route path="deals" element={<Deals />} />
            <Route path="activities" element={<Activities />} />
            <Route path="users" element={<Users />} />
            <Route path="map" element={<KnockMap />} />
            <Route path="team-map" element={<TeamMap />} />
            <Route path="booking" element={<Booking />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="chats" element={<Chats />} />
            <Route path="jobs" element={<JobAssignment />} />
            <Route path="tech-schedule" element={<TechSchedule />} />
            <Route path="clock-in" element={<ClockInOut />} />
            <Route path="timesheet" element={<Timesheet />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="team-sales" element={<TeamSales />} />
            <Route path="new-numbers" element={<NewNumbers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
