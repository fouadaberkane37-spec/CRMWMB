import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../App.jsx'
import { Send, MessageSquare, ArrowLeft, Circle } from 'lucide-react'

const API = '/api'

function timeAgo(dt) {
  const d = new Date(dt)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return d.toLocaleDateString()
}

export default function Chats() {
  const { token } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEnd = useRef(null)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function loadConversations() {
    const res = await fetch(`${API}/chats/conversations`, { headers })
    const data = await res.json()
    setConversations(data)
    setLoading(false)
  }

  async function loadMessages(phone) {
    const res = await fetch(`${API}/chats/${encodeURIComponent(phone)}`, { headers })
    setMessages(await res.json())
    // After reading, refresh conversation list to clear badge
    loadConversations()
  }

  useEffect(() => {
    loadConversations()
    const iv = setInterval(loadConversations, 15000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (selected) {
      loadMessages(selected.phone_number)
      const iv = setInterval(() => loadMessages(selected.phone_number), 10000)
      return () => clearInterval(iv)
    }
  }, [selected])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!draft.trim() || !selected) return
    const body = draft.trim()
    setDraft('')
    await fetch(`${API}/chats/${encodeURIComponent(selected.phone_number)}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to_number: selected.phone_number, body, contact_id: selected.contact_id }),
    })
    loadMessages(selected.phone_number)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Mobile: show list or thread
  if (selected) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white p-1 -ml-1 md:hidden">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-white font-medium text-sm">{selected.contact_name || selected.phone_number}</p>
            <p className="text-slate-500 text-xs">{selected.phone_number}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                msg.direction === 'outbound'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-slate-800 text-slate-100 rounded-bl-sm'
              }`}>
                <p>{msg.body}</p>
                <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {timeAgo(msg.created_at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 p-3 border-t border-slate-800 bg-slate-900">
          <textarea
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a message..."
            className="flex-1 bg-slate-800 text-white rounded-xl px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none max-h-32"
          />
          <button onClick={send} disabled={!draft.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors">
            <Send size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Conversation list */}
      <div className="w-full md:w-80 flex-shrink-0 border-r border-slate-800 overflow-y-auto">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-white font-bold text-lg">Messages</h1>
          <p className="text-slate-400 text-sm">{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-12 text-sm">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <MessageSquare size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No conversations yet</p>
          </div>
        ) : (
          conversations.map(c => (
            <button
              key={c.phone_number}
              onClick={() => setSelected(c)}
              className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 text-left"
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-sm font-medium text-white">
                {(c.contact_name || c.phone_number).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium truncate">{c.contact_name || c.phone_number}</span>
                  <span className="text-slate-500 text-xs shrink-0 ml-2">{timeAgo(c.last_message_at)}</span>
                </div>
                <p className="text-slate-400 text-xs truncate mt-0.5">{c.last_message}</p>
              </div>
              {c.unread_count > 0 && (
                <span className="bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-medium">
                  {c.unread_count}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Desktop empty state */}
      <div className="hidden md:flex flex-1 items-center justify-center text-slate-600">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p>Select a conversation</p>
        </div>
      </div>
    </div>
  )
}
