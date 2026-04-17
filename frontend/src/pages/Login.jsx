import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import api from '../api.js'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]           = useState({ username: '', password: '' })
  const [step, setStep]           = useState('credentials') // 'credentials' | 'otp'
  const [sessionId, setSessionId] = useState('')
  const [phoneHint, setPhoneHint] = useState('')
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()]

  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('username', form.username)
      params.append('password', form.password)
      const { data } = await api.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      setSessionId(data.session_id)
      setPhoneHint(data.phone_hint)
      setStep('otp')
      setTimeout(() => otpRefs[0].current?.focus(), 100)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(Array.isArray(detail) ? 'Login failed' : (detail || 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', { session_id: sessionId, otp: code })
      const { data: user } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      login(user, data.access_token)
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(Array.isArray(detail) ? 'Verification failed' : (detail || 'Verification failed'))
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => otpRefs[0].current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpInput(idx, value) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[idx] = digit
    setOtp(next)
    if (digit && idx < 5) otpRefs[idx + 1].current?.focus()
  }

  function handleOtpKey(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs[idx - 1].current?.focus()
    }
  }

  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      otpRefs[5].current?.focus()
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center bg-slate-950 px-5"
      style={{ minHeight: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-3xl mb-5 shadow-lg shadow-indigo-900/50">
            <span className="text-white text-4xl font-black">W</span>
          </div>
          <h1 className="text-3xl font-bold text-white">WMB CRM</h1>
          <p className="text-slate-400 text-sm mt-2">
            {step === 'otp' ? 'Enter your verification code' : 'Sign in to your account'}
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-2xl px-4 py-3 text-sm" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-username" className="block text-sm font-semibold text-slate-300 mb-2">Username</label>
              <input
                id="login-username"
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className="w-full border border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-2xl px-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{ height: '52px' }}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
              <input
                id="login-password"
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-2xl px-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{ height: '52px' }}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-2xl text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
              style={{ height: '56px' }}
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Sending code…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-6">
            {error && (
              <div className="bg-red-900/30 border border-red-800/50 text-red-400 rounded-2xl px-4 py-3 text-sm text-center" role="alert">
                {error}
              </div>
            )}

            <p className="text-slate-400 text-sm text-center">
              A 6-digit code was sent to <span className="text-white font-semibold">{phoneHint}</span>
            </p>

            <div className="flex gap-3 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={otpRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpInput(idx, e.target.value)}
                  onKeyDown={e => handleOtpKey(idx, e)}
                  className="w-12 h-14 text-center text-xl font-bold border border-slate-700 bg-slate-800 text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || otp.join('').length < 6}
              className="w-full bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-2xl text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ height: '56px' }}
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(''); setOtp(['','','','','','']) }}
              className="w-full text-slate-500 text-sm text-center"
            >
              Back to sign in
            </button>
          </form>
        )}

        <p className="text-center text-slate-600 text-xs mt-8">
          Groupe WMB · Team CRM
        </p>
      </div>
    </div>
  )
}
