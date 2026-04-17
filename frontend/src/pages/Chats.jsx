import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Send, ArrowLeft, MessageSquare, Search } from 'lucide-react'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return d.toLocaleDateString()
}

function Avatar({ name = '?', size = 'md' }) {
  const safe = String(name || '?')
  const initials = safe.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-purple-500', 'bg-cyan-500']
  const color = colors[(safe.charCodeAt(0) || 0) % colors.length]
  return (
    <div className={`${cls} ${color} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}>
      {initials || '?'}
    </div>
  )
}

export default function Chats() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  // contactId -> { body, created_at, unread }
  const [convMap, setConvMap] = useState({})
  const [activeContact, setActiveContact] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadList = useCallback(() => {
    api.get('/contacts/').then((r) => setContacts(r.data)).catch(() => {})
    api.get('/chats/').then((r) => {
      const map = {}
      r.data.forEach((c) => {
        map[c.contact_id] = { body: c.last_message, created_at: c.last_at, unread: c.unread || 0 }
      })
      setConvMap(map)
    }).catch(() => {})
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // Poll the conversation list every 10s to keep unread counts fresh
  useEffect(() => {
    const id = setInterval(loadList, 10000)
    return () => clearInterval(id)
  }, [loadList])

  const loadMessages = useCallback((cid) => {
    if (!cid) return
    api.get(`/chats/${cid}`).then((r) => {
      setMessages(r.data)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    clearInterval(pollRef.current)
    if (activeContact) {
      loadMessages(activeContact.id)
      pollRef.current = setInterval(() => loadMessages(activeContact.id), 4000)
    }
    return () => clearInterval(pollRef.current)
  }, [activeContact, loadMessages])

  function openContact(contact) {
    setActiveContact(contact)
    setMessages([])
    setError('')
    // Mark as read — fire and forget, then refresh list
    api.post(`/chats/${contact.id}/read`).then(() => {
      setConvMap(prev => ({
        ...prev,
        [contact.id]: { ...prev[contact.id], unread: 0 },
      }))
    }).catch(() => {})
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || !activeContact) return
    setSending(true)
    setError('')
    try {
      const { data } = await api.post(`/chats/${activeContact.id}`, { body: input.trim() })
      setMessages((prev) => [...prev, data])
      setInput('')
      loadList()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to send — check your connection')
    } finally {
      setSending(false)
    }
  }

  const filtered = contacts.filter((c) => {
    const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase()
    return name.includes(searchQ.toLowerCase())
  })

  // Sort: unread first, then by recency, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aConv = convMap[a.id]
    const bConv = convMap[b.id]
    const aUnread = aConv?.unread || 0
    const bUnread = bConv?.unread || 0
    if (aUnread && !bUnread) return -1
    if (!aUnread && bUnread) return 1
    if (aConv && !bConv) return -1
    if (!aConv && bConv) return 1
    if (aConv && bConv) return new Date(bConv.created_at) - new Date(aConv.created_at)
    return `${a.first_name}`.localeCompare(`${b.first_name}`)
  })

  const showThread = activeContact !== null
  const contactName = activeContact ? `${activeContact.first_name} ${activeContact.last_name || ''}`.trim() : ''

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Contact / conversation list ── */}
      <div className={`${showThread ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-700/50 flex-shrink-0`}>
        <div className="px-4 py-4 border-b border-slate-700/50">
          <h1 className="text-white font-bold text-lg mb-3">Messages</h1>
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
            <Search size={15} className="text-slate-500 flex-shrink-0" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search contacts…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
              <MessageSquare size={36} className="opacity-30" />
              <p className="text-sm">No contacts found</p>
            </div>
          )}
          {sorted.map((contact) => {
            const name = `${contact.first_name} ${contact.last_name || ''}`.trim()
            const conv = convMap[contact.id]
            const isActive = activeContact?.id === contact.id
            const hasUnread = (conv?.unread || 0) > 0

            return (
              <button
                key={contact.id}
                onClick={() => openContact(contact)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left border-b border-slate-800/50 ${
                  isActive ? 'bg-slate-800' : 'hover:bg-slate-800/60 active:bg-slate-800'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={name} />
                  {hasUnread && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${hasUnread ? 'text-white font-bold' : 'text-white font-semibold'}`}>
                      {name}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {conv && <span className="text-slate-500 text-xs">{timeAgo(conv.created_at)}</span>}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                          {conv.unread > 99 ? '99+' : conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                    {conv ? conv.body : 'Tap to start chatting'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Thread ── */}
      {showThread ? (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3 bg-slate-900">
            <button onClick={() => setActiveContact(null)} className="md:hidden text-slate-400 p-1 -ml-1">
              <ArrowLeft size={22} />
            </button>
            <Avatar name={contactName} />
            <div>
              <p className="text-white font-semibold text-sm">{contactName}</p>
              <p className="text-slate-500 text-xs capitalize">{activeContact?.status || 'contact'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-700">
                <MessageSquare size={40} className="opacity-30" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs">Say something to {activeContact?.first_name}</p>
              </div>
            )}
            {messages.map((msg) => {
              const isOutbound = msg.direction !== 'inbound'
              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} gap-2 items-end`}>
                  {!isOutbound && <Avatar name={msg.sender_name || '?'} size="sm" />}
                  <div className={`max-w-[72%] flex flex-col gap-1 ${isOutbound ? 'items-end' : 'items-start'}`}>
                    {!isOutbound && <span className="text-xs text-slate-500 px-1">{msg.sender_name}</span>}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isOutbound ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                    }`}>
                      {msg.body}
                    </div>
                    <span className="text-xs text-slate-600 px-1">{timeAgo(msg.created_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="mx-3 mb-1 px-3 py-2 bg-red-900/50 border border-red-700/50 rounded-xl text-red-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={sendMessage} className="px-3 py-3 border-t border-slate-700/50 flex items-center gap-2 bg-slate-900">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${activeContact?.first_name}…`}
              className="flex-1 bg-slate-800 text-sm text-slate-200 placeholder-slate-500 rounded-2xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 hover:bg-indigo-500 transition-colors flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-slate-700">
          <MessageSquare size={56} className="opacity-20" />
          <p className="text-base">Select a contact to chat</p>
        </div>
      )}
    </div>
  )
}
