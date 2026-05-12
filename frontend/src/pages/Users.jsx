import React, { useState, useEffect } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Pencil, Trash2, ShieldCheck, User, Phone, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '../App.jsx'

/** Format a raw phone string as +1XXXXXXXXXX for storage */
function toE164(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return raw
}
/** Display stored +1XXXXXXXXXX as (514) 555-1234 */
function fmtPhone(stored) {
  if (!stored) return ''
  const digits = stored.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1)
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }
  return stored
}

const EMPTY = { username: '', email: '', full_name: '', phone: '', role: 'user', password: '' }
const INVITE_EMPTY = { phone: '', full_name: '', role: 'user' }

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState(null)

  // Invite state
  const [inviteModal, setInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState(INVITE_EMPTY)
  const [inviteResult, setInviteResult] = useState(null) // { invite_url }
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = () => api.get('/users/').then((r) => setUsers(r.data))
  useEffect(() => { load() }, [])

  function openCreate() { setForm(EMPTY); setError(''); setModal('create') }
  function openEdit(u) { setForm({ ...u, phone: u.phone || '', password: '' }); setError(''); setModal(u) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, phone: form.phone ? toE164(form.phone) : '' }
      if (modal === 'create') await api.post('/users/', payload)
      else await api.put(`/users/${modal.id}`, payload)
      setModal(null)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function del() {
    try {
      await api.delete(`/users/${deleteId}`)
      setDeleteId(null)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete user')
      setDeleteId(null)
    }
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function resetAllPasswords() {
    if (!window.confirm('Generate new passwords for all non-admin users and send via SMS?')) return
    setResetting(true)
    try {
      const { data } = await api.post('/users/reset-all-passwords')
      setResetResult(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  function openInvite() {
    setInviteForm(INVITE_EMPTY)
    setInviteResult(null)
    setInviteError('')
    setCopied(false)
    setInviteModal(true)
  }

  async function sendInvite() {
    setInviteSaving(true)
    setInviteError('')
    try {
      const { data } = await api.post('/invites/', inviteForm)
      setInviteResult(data)
    } catch (err) {
      setInviteError(err.response?.data?.detail || 'Failed to create invite')
    } finally {
      setInviteSaving(false)
    }
  }

  function copyLink() {
    const url = inviteResult?.invite_url
    if (!url) return
    const full = url.startsWith('http') ? url : `${window.location.origin}${url}`
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="p-8 overflow-x-auto min-w-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Users</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} accounts · unlimited</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAllPasswords}
            disabled={resetting}
            className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <RefreshCw size={16} className={resetting ? 'animate-spin' : ''} />
            Reset Passwords
          </button>
          <button onClick={openInvite} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <Phone size={16} /> Invite
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={16} /> Add User
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">User</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Username</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Role</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Joined</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center font-semibold text-sm">
                      {(u.full_name || u.username)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">{u.full_name || '—'}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3.5 text-slate-400 font-mono text-xs">{u.username}</td>
                <td className="px-6 py-3.5">
                  {u.role === 'admin'
                    ? <span className="flex items-center gap-1 text-xs font-medium text-indigo-400 bg-indigo-900/40 px-2 py-0.5 rounded-full w-fit"><ShieldCheck size={11} />Admin</span>
                    : u.role === 'technician'
                      ? <span className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full w-fit"><User size={11} />Technician</span>
                      : <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-full w-fit"><User size={11} />Sales</span>}
                </td>
                <td className="px-6 py-3.5">
                  {u.phone
                    ? <span className="text-slate-300 text-xs font-mono">{fmtPhone(u.phone)}</span>
                    : u.role === 'technician'
                      ? <span className="flex items-center gap-1 text-amber-500 text-xs"><AlertTriangle size={11} />Missing</span>
                      : <span className="text-slate-600 text-xs">—</span>
                  }
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(u)} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded-lg"><Pencil size={14} /></button>
                    {u.id !== me?.id && (
                      <button onClick={() => setDeleteId(u.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New User' : 'Edit User'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {error && <div className="bg-red-900/30 text-red-400 text-sm px-4 py-3 rounded-lg border border-red-800/50">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username *</label>
                <input value={form.username} onChange={f('username')} className="input" disabled={modal !== 'create'} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                <input value={form.full_name} onChange={f('full_name')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone Number
                {(form.role === 'technician' || modal?.role === 'technician') && (
                  <span className="ml-2 text-xs text-amber-400 font-normal">Required for reminders</span>
                )}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={f('phone')}
                className="input"
                placeholder="(514) 555-1234"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {modal === 'create' ? 'Password *' : 'New Password'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={f('password')}
                  className="input"
                  placeholder={modal !== 'create' ? 'Leave blank to keep' : ''}
                  required={modal === 'create'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select value={form.role} onChange={f('role')} className="input">
                  <option value="user">User</option>
                  <option value="sales">Sales</option>
                  <option value="technician">Technician</option>
                  <option value="admin">Admin</option>
                  <option value="ceo">CEO</option>
                </select>
              </div>
            </div>
            {modal !== 'create' && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                <label htmlFor="active" className="text-sm text-slate-300">Active account</label>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete User" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-slate-400 text-sm mb-6">Permanently delete this user account?</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm">Cancel</button>
            <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}

      {resetResult && (
        <Modal title="Passwords Reset" onClose={() => setResetResult(null)} size="sm">
          <p className="text-slate-400 text-sm mb-4">
            Reset <span className="text-white font-semibold">{resetResult.reset}</span> accounts.
          </p>
          <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
            {resetResult.details.map(u => (
              <div key={u.id} className="flex items-center justify-between text-sm px-3 py-2 bg-slate-800 rounded-lg">
                <span className="text-slate-300">{u.full_name || u.username}</span>
                {u.sms_sent
                  ? <span className="text-emerald-400 text-xs">SMS sent</span>
                  : <span className="text-amber-400 text-xs">{u.phone ? 'SMS failed' : 'No phone'}</span>}
              </div>
            ))}
          </div>
          <button onClick={() => setResetResult(null)} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-lg text-sm">
            Close
          </button>
        </Modal>
      )}

      {inviteModal && (
        <Modal title="Invite by Phone" onClose={() => setInviteModal(false)}>
          <div className="space-y-4">
            {inviteError && (
              <div className="bg-red-900/30 text-red-400 text-sm px-4 py-3 rounded-lg border border-red-800/50">{inviteError}</div>
            )}

            {!inviteResult ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={inviteForm.full_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                    className="input"
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="input"
                    placeholder="+1 (555) 000-0000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                  <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="input">
                    <option value="user">User</option>
                    <option value="sales">Sales</option>
                    <option value="technician">Technician</option>
                    <option value="admin">Admin</option>
                    <option value="ceo">CEO</option>
                  </select>
                </div>
                <p className="text-slate-500 text-xs">
                  An invite link will be generated and sent via SMS automatically if Twilio is configured.
                </p>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setInviteModal(false)} className="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Cancel</button>
                  <button onClick={sendInvite} disabled={inviteSaving || !inviteForm.phone || !inviteForm.full_name} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    {inviteSaving ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-4 py-3">
                  <p className="text-emerald-400 text-sm font-medium">Invite sent to {inviteResult.full_name}!</p>
                  <p className="text-slate-400 text-xs mt-0.5">SMS sent to {inviteResult.phone}. Link expires in 48 hours.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Invite link (copy to share manually)</label>
                  <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2.5 border border-slate-700">
                    <span className="flex-1 text-slate-300 text-xs font-mono break-all">
                      {inviteResult.invite_url?.startsWith('http')
                        ? inviteResult.invite_url
                        : `${window.location.origin}${inviteResult.invite_url}`}
                    </span>
                    <button onClick={copyLink} className="flex-shrink-0 flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs font-medium">
                      {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                    </button>
                  </div>
                </div>
                <button onClick={() => setInviteModal(false)} className="w-full border border-slate-600 text-slate-300 py-2.5 rounded-lg text-sm hover:bg-slate-800">Done</button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
