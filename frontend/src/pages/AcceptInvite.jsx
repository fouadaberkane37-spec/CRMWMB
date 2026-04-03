import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Zap, Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [invite, setInvite] = useState(null) // { email, role, valid }
  const [form, setForm] = useState({ username: '', full_name: '', password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get(`/invites/check/${token}`)
      .then((r) => setInvite(r.data))
      .catch(() => setInvite({ valid: false }))
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError("Passwords don't match")
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post(`/invites/accept/${token}`, {
        username: form.username,
        full_name: form.full_name || undefined,
        password: form.password,
      })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (!invite?.valid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Invalid or expired link</h1>
          <p className="text-slate-400 text-sm mb-6">This invite link is no longer valid. Ask your admin to send a new one.</p>
          <button onClick={() => navigate('/login')} className="text-indigo-400 text-sm hover:underline">
            Go to login
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Account created!</h1>
          <p className="text-slate-400 text-sm mb-6">You can now sign in with your username and password.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-slate-400 text-sm mt-1">
            Invited as <span className="text-slate-200 font-medium">{invite.email}</span>
            {' '}· <span className="capitalize">{invite.role}</span>
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl p-8 space-y-4"
        >
          {error && (
            <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Username *</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="johndoe"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Full name</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Min. 6 characters"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password *</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Repeat password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Create account
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-indigo-400 hover:underline">Sign in</button>
        </p>
      </div>
    </div>
  )
}
