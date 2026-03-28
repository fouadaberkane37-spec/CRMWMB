import React, { useState, useEffect } from 'react'
import api from '../api.js'
import Modal from '../components/Modal.jsx'
import { Plus, Pencil, Trash2, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../App.jsx'

const EMPTY = { username: '', email: '', full_name: '', role: 'user', password: '' }

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')

  const load = () => api.get('/users/').then((r) => setUsers(r.data))
  useEffect(() => { load() }, [])

  function openCreate() { setForm(EMPTY); setError(''); setModal('create') }
  function openEdit(u) { setForm({ ...u, password: '' }); setError(''); setModal(u) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (modal === 'create') await api.post('/users/', form)
      else await api.put(`/users/${modal.id}`, form)
      setModal(null)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function del() {
    await api.delete(`/users/${deleteId}`)
    setDeleteId(null)
    load()
  }

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Users</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} accounts · unlimited</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">User</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Username</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Role</th>
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
                    : <span className="flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full w-fit"><User size={11} />User</span>}
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3.5">
                  {u.id !== me?.id && (
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded-lg"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(u.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  )}
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
              <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={f('email')} className="input" required />
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
                  <option value="admin">Admin</option>
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
    </div>
  )
}
