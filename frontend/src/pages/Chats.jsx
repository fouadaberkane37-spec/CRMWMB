import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api.js'
import { useAuth } from '../App.jsx'
import { Send, ArrowLeft, MessageSquare, Search, Plus, X } from 'lucide-react'

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

function Avatar({ name, size = 'md' }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const colors = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-orange-500',
    'bg-pink-500', 'bg-purple-500', 'bg-cyan-500',
  ]
  const color = colors[(name.charCodeAt(0) || 0) % colors.length]
  return (
    <div className={`${cls} ${color} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}>
      {initials || '?'}
    </div>
  )
}

export default function Chats() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeContactId, setActiveContactId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [contacts, setContacts] = useState([])
  const [searchQ, setSearchQ] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const activeConv = conversations.find((c) => c.contact_id === activeContactId)

  const loadConversations = useCallback(() => {
    api.get('/chats/').then((r) => setConversations(r.data))
  }, [])

  const loadMessages = useCallback((cid) => {
    if (!cid) return
    api.get(`/chats/${cid}`).then((r) => {
      setMessages(r.data)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
  }, [])

  useEffect(() => {
    loadConversations()
    api.get('/contacts/').then((r) => setContacts(r.data))
  }, [loadConversations])

  // Poll messages every 4s when a chat is open
  useEffect(() => {
    clearInterval(pollRef.current)
    if (activeContactId) {
      loadMessages(activeContactId)
      pollRef.current = setInterval(() => loadMessages(activeContactId), 4000)
    }
    return () => clearInterval(pollRef.current)
  }, [activeContactId, loadMessages])

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || !activeContactId) return
    setSending(true)
    try {
      const { data } = await api.post(`/chats/${activeContactId}`, { body: input.trim() })
      setMessages((prev) => [...prev, data])
      setInput('')
      loadConversations()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } finally {
      setSending(false)
    }
  }

  function openContact(cid) {
    setActiveContactId(cid)
    setShowNewChat(false)
  }

  const filteredConvs = conversations.filter((c) =>
    c.contact_name.toLowerCase().includes(searchQ.toLowerCase())
  )

  const filteredContacts = contacts.filter((c) => {
    const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase()
    return name.includes(contactSearch.toLowerCase())
  })

  // Mobile: show thread if activeContactId set
  const showThread = activeContactId !== null

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Conversation list ── */}
      <div className={`${showThread ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-700/50 flex-shrink-0`}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h1 className="text-white font-bold text-lg">Chats</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-slate-700/30">
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
            <Search size={15} className="text-slate-500 flex-shrink-0" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search conversations…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
              <MessageSquare size={36} className="opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="text-indigo-400 text-sm font-medium"
              >
                Start a chat
              </button>
            </div>
          )}
          {filteredConvs.map((conv) => (
            <button
              key={conv.contact_id}
              onClick={() => openContact(conv.contact_id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800/60 transition-colors text-left ${
                activeContactId === conv.contact_id ? 'bg-slate-800' : ''
              }`}
            >
              <Avatar name={conv.contact_name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-semibold truncate">{conv.contact_name}</p>
                  <span className="text-slate-500 text-xs flex-shrink-0 ml-2">{timeAgo(conv.last_at)}</span>
                </div>
                <p className="text-slate-400 text-xs truncate mt-0.5">{conv.last_message || ''}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Thread panel ── */}
      {showThread ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Thread header */}
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3 bg-slate-900">
            <button
              onClick={() => setActiveContactId(null)}
              className="md:hidden text-slate-400 p-1 -ml-1"
            >
              <ArrowLeft size={22} />
            </button>
            {activeConv && <Avatar name={activeConv.contact_name} />}
            <div>
              <p className="text-white font-semibold text-sm">{activeConv?.contact_name}</p>
              <p className="text-slate-500 text-xs">Client</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
                <MessageSquare size={40} className="opacity-30" />
                <p className="text-sm">No messages yet — say hi!</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === user?.id
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2 items-end`}>
                  {!isMe && <Avatar name={msg.sender_name || '?'} size="sm" />}
                  <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {!isMe && (
                      <span className="text-xs text-slate-500 px-1">{msg.sender_name}</span>
                    )}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                      }`}
                    >
                      {msg.body}
                    </div>
                    <span className="text-xs text-slate-600 px-1">{timeAgo(msg.created_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="px-3 py-3 border-t border-slate-700/50 flex items-center gap-2 bg-slate-900"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
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
        /* Empty state on desktop when nothing selected */
        <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-slate-600">
          <MessageSquare size={56} className="opacity-20" />
          <p className="text-base">Select a conversation</p>
        </div>
      )}

      {/* ── New chat modal ── */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowNewChat(false)} />
          <div className="relative bg-slate-900 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50">
              <h2 className="text-white font-semibold">New Conversation</h2>
              <button onClick={() => setShowNewChat(false)} className="text-slate-400 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-slate-700/30">
              <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
                <Search size={15} className="text-slate-500" />
                <input
                  autoFocus
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredContacts.map((c) => {
                const name = `${c.first_name} ${c.last_name || ''}`.trim()
                return (
                  <button
                    key={c.id}
                    onClick={() => openContact(c.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left"
                  >
                    <Avatar name={name} size="sm" />
                    <div>
                      <p className="text-white text-sm font-medium">{name}</p>
                      {c.email && <p className="text-slate-500 text-xs">{c.email}</p>}
                    </div>
                  </button>
                )
              })}
              {filteredContacts.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-8">No contacts found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
