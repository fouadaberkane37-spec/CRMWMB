import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Zap, Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'

/** Auto-generate a username suggestion from a full name */
function suggestUsername(fullName) {
  if (!fullName) return ''
  return fullName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
}

export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [checking, setChecking]   = useState(true)
  const [invite, setInvite]       = useState(null)
  const [form, setForm]           = useState({ username: '', password: '', confirm: '' })
  const [showPw, setShowPw]       = useState(false)
  const [showCf, setShowCf]       = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [apiError, setApiError]   = useState('')

  useEffect(() => {
    api.get(`/invites/check/${token}`)
      .then((r) => {
        setInvite(r.data)
        // Auto-suggest username from their name
        if (r.data?.full_name) {
          setForm(f => ({ ...f, username: suggestUsername(r.data.full_name) }))
        }
      })
      .catch((err) => {
        setApiError(err.message || 'Could not reach the server')
        setInvite({ valid: false })
      })
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError("Passwords don't match"); return }
    if (form.password.length < 6)       { setError('Password must be at least 6 characters'); return }
    setSaving(true)
    setError('')
    try {
      await api.post(`/invites/accept/${token}`, {
        username:  form.username,
        full_name: invite?.full_name || undefined,
        password:  form.password,
      })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  /* ── Loading ── */
  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
      </div>
    )
  }

  /* ── Invalid link ── */
  if (!invite?.valid) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Invalid or expired link</h1>
          <p className="text-slate-400 text-sm mb-4">
            {apiError
              ? `Could not reach the server: ${apiError}`
              : 'This invite link has expired or already been used. Ask your admin to generate a new one.'}
          </p>
          <button onClick={() => navigate('/login')} className="text-indigo-400 text-sm hover:underline">
            Go to login
          </button>
        </div>
      </div>
    )
  }

  /* ── Done ── */
  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle size={52} className="text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">You're all set!</h1>
          <p className="text-slate-400 text-sm mb-6">
            Your account has been created. Sign in with your username and password.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome, {invite.full_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Create your password to activate your account
          </p>
          <span className="inline-block mt-2 px-3 py-1 bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 text-xs rounded-full capitalize">
            {invite.role === 'user' ? 'Sales' : invite.role}
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-700/40 rounded-2xl shadow-2xl p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Username <span className="text-slate-500 font-normal text-xs">(used to sign in)</span>
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
              className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. john.doe"
              required
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-3 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min. 6 characters"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
            <div className="relative">
              <input
                type={showCf ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-3 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Repeat password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCf(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Creating account…' : 'Create my account'}
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-5">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-indigo-400 hover:underline">Sign in</button>
        </p>
      </div>
    </div>
  )
}
