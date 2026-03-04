import { useState, useEffect, useRef } from 'react'
import { MessageCircle, ArrowLeft, Send, Plus, Search, X, Loader2 } from 'lucide-react'
import { useApp } from '../App'
import { supabase } from '../lib/supabase'
import {
  fetchConversations,
  fetchMessages,
  sendMessage,
  findOrCreateConversation,
  markMessagesRead,
} from '../lib/supabase'

function timeAgo(dateString) {
  if (!dateString) return ''
  const diff  = Date.now() - new Date(dateString).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'now'
  if (mins  < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days  < 7)  return `${days}d`
  return new Date(dateString).toLocaleDateString()
}

export default function MessagesPage() {
  const { user, showAuthModal, setUnreadCount } = useApp()

  /* ── Conversation list state ── */
  const [conversations, setConversations] = useState([])
  const [convsLoading, setConvsLoading]   = useState(true)

  /* ── Chat view state ── */
  const [selectedConv, setSelectedConv]   = useState(null)
  const [messages, setMessages]           = useState([])
  const [chatLoading, setChatLoading]     = useState(false)
  const [msgInput, setMsgInput]           = useState('')
  const [sending, setSending]             = useState(false)

  /* ── New message modal ── */
  const [showNewMsg, setShowNewMsg]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [startingConvId, setStartingConvId] = useState(null) // profile.id being processed
  const [startConvError, setStartConvError] = useState(null)

  const messagesEndRef = useRef(null)
  const chatInputRef   = useRef(null)

  /* ─────────── Load conversations ─────────── */
  useEffect(() => {
    if (!user) { setConvsLoading(false); return }
    setConvsLoading(true)
    fetchConversations(user.id)
      .then(setConversations)
      .catch(console.error)
      .finally(() => setConvsLoading(false))
  }, [user?.id])

  /* ─────────── Load messages on conv select ─────────── */
  useEffect(() => {
    if (!selectedConv || !user) return
    setChatLoading(true)
    setMessages([])

    fetchMessages(selectedConv.id)
      .then(async msgs => {
        setMessages(msgs)
        await markMessagesRead(selectedConv.id, user.id)
        // Refresh global unread count
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .eq('type', 'message')
        setUnreadCount(count ?? 0)
        // Clear unread in local list
        setConversations(prev =>
          prev.map(c => c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c)
        )
      })
      .catch(console.error)
      .finally(() => setChatLoading(false))
  }, [selectedConv?.id])

  /* ─────────── Real-time messages ─────────── */
  useEffect(() => {
    if (!selectedConv || !user) return

    const channel = supabase
      .channel(`chat-${selectedConv.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConv.id}`,
        },
        async (payload) => {
          // Avoid duplicate if we already added optimistically
          setMessages(prev =>
            prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
          )
          if (payload.new.sender_id !== user.id) {
            await markMessagesRead(selectedConv.id, user.id)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedConv?.id, user?.id])

  /* ─────────── Auto-scroll to latest message ─────────── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ─────────── User search ─────────── */
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${searchQuery}%`)
        .neq('id', user.id)
        .limit(10)
      setSearchResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, user?.id])

  /* ─────────── Handlers ─────────── */
  const handleSend = async () => {
    if (!msgInput.trim() || sending) return
    const content = msgInput.trim()
    setMsgInput('')
    setSending(true)
    try {
      const msg = await sendMessage(user.id, selectedConv.id, content)
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      setConversations(prev =>
        prev.map(c => c.id === selectedConv.id
          ? { ...c, last_message_at: msg.created_at, last_message_content: content }
          : c
        )
      )
    } catch (err) {
      console.error('send error', err)
      setMsgInput(content) // restore on failure
    } finally {
      setSending(false)
      chatInputRef.current?.focus()
    }
  }

  const handleStartConversation = async (profile) => {
    if (startingConvId) return // prevent double-tap
    setStartingConvId(profile.id)
    setStartConvError(null)
    try {
      const conv = await findOrCreateConversation(user.id, profile.id)
      const augmented = { ...conv, otherProfile: profile, unreadCount: 0 }
      setConversations(prev => {
        const exists = prev.find(c => c.id === augmented.id)
        return exists ? prev : [augmented, ...prev]
      })
      setShowNewMsg(false)
      setSearchQuery('')
      setSearchResults([])
      setSelectedConv(augmented)
    } catch (err) {
      console.error('start conv error', err)
      setStartConvError(
        err?.message?.includes('relation') || err?.code === '42P01'
          ? 'Database not set up yet — run supabase/schema_social.sql first.'
          : 'Could not start conversation. Please try again.'
      )
    } finally {
      setStartingConvId(null)
    }
  }

  const openConversation = (conv) => {
    setSelectedConv(conv)
  }

  /* ─────────── Not logged in ─────────── */
  if (!user) {
    return (
      <div className="page">
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={18} style={{ color: 'var(--purple-l)' }} />
            <h1>Messages</h1>
          </div>
        </header>
        <div className="page-scroll">
          <div className="empty-state">
            <div className="empty-icon"><MessageCircle size={28} /></div>
            <h3>Sign in to message</h3>
            <p>Connect privately with the celiac community.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={showAuthModal}
            >
              Sign In / Sign Up
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─────────── Chat view ─────────── */
  if (selectedConv) {
    const other = selectedConv.otherProfile

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', animation: 'fadeUp 0.3s ease' }}>
        <header className="page-header">
          <button
            className="btn-icon"
            onClick={() => setSelectedConv(null)}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, marginLeft: 8 }}>
            <div className="avatar-sm" style={{ width: 32, height: 32, fontSize: '0.85rem', flexShrink: 0 }}>
              {(other?.username ?? '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                @{other?.username ?? 'Unknown'}
              </div>
            </div>
          </div>
        </header>

        {/* Messages area */}
        <div className="chat-messages">
          {chatLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-dim)' }} />
            </div>
          )}

          {!chatLoading && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 40 }}>
              No messages yet — say hi! 👋
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`msg-row${msg.sender_id === user.id ? ' mine' : ''}`}
            >
              <div className={`msg-bubble${msg.sender_id === user.id ? ' mine' : ' theirs'}`}>
                {msg.content}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="chat-input-bar">
          <input
            ref={chatInputRef}
            className="input chat-input"
            placeholder="Message…"
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
            maxLength={2000}
            autoFocus
          />
          <button
            className="btn btn-primary"
            style={{ padding: '10px 14px', borderRadius: 10, flexShrink: 0 }}
            onClick={handleSend}
            disabled={sending || !msgInput.trim()}
            aria-label="Send"
          >
            {sending
              ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Send size={16} />
            }
          </button>
        </div>
      </div>
    )
  }

  /* ─────────── Conversation list ─────────── */
  return (
    <div className="page">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={18} style={{ color: 'var(--purple-l)' }} />
          <h1>Messages</h1>
        </div>
        <button
          className="btn-icon"
          onClick={() => setShowNewMsg(true)}
          title="New message"
          aria-label="New message"
        >
          <Plus size={16} />
        </button>
      </header>

      <div className="page-scroll" style={{ padding: 0, gap: 0 }}>
        {convsLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-dim)' }} />
          </div>
        )}

        {!convsLoading && conversations.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><MessageCircle size={28} /></div>
            <h3>No messages yet</h3>
            <p>Start a private conversation with another celiac community member.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={() => setShowNewMsg(true)}
            >
              New Message
            </button>
          </div>
        )}

        {conversations.map(conv => (
          <div
            key={conv.id}
            className="conv-item"
            onClick={() => openConversation(conv)}
          >
            <div
              className="avatar-sm"
              style={{ width: 44, height: 44, fontSize: '1rem', flexShrink: 0 }}
            >
              {(conv.otherProfile?.username ?? '?')[0].toUpperCase()}
            </div>

            <div className="conv-body">
              <div className="conv-header">
                <span className="conv-name">@{conv.otherProfile?.username ?? 'Unknown'}</span>
                <span className="conv-time">{timeAgo(conv.last_message_at)}</span>
              </div>
              <div
                className="conv-preview"
                style={{ fontWeight: conv.unreadCount > 0 ? 600 : 400, color: conv.unreadCount > 0 ? 'var(--text-muted)' : 'var(--text-dim)' }}
              >
                {conv.last_message_content
                  ? (conv.last_message_sender === user.id ? 'You: ' : '') + conv.last_message_content
                  : 'No messages yet'
                }
              </div>
            </div>

            {conv.unreadCount > 0 && (
              <span className="conv-unread">
                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── New Message modal ── */}
      {showNewMsg && (
        <div
          className="modal-overlay"
          onClick={() => { if (!startingConvId) { setShowNewMsg(false); setSearchQuery(''); setStartConvError(null) } }}
        >
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>New Message</h2>
              <button
                className="btn-icon"
                onClick={() => { setShowNewMsg(false); setSearchQuery(''); setStartConvError(null) }}
                disabled={!!startingConvId}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={16} style={{
                position: 'absolute', left: 12, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-dim)',
                pointerEvents: 'none',
              }} />
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="Search by username…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setStartConvError(null) }}
                autoFocus
                disabled={!!startingConvId}
              />
            </div>

            {/* Error feedback */}
            {startConvError && (
              <div className="modal-error" style={{ marginBottom: 12 }}>
                {startConvError}
              </div>
            )}

            {searching && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-dim)' }} />
              </div>
            )}

            {!searching && searchResults.map(profile => {
              const isLoading = startingConvId === profile.id
              return (
                <div
                  key={profile.id}
                  className="conv-item"
                  style={{
                    padding: '10px 0',
                    borderBottom: 'none',
                    opacity: startingConvId && !isLoading ? 0.4 : 1,
                    pointerEvents: startingConvId ? 'none' : 'auto',
                  }}
                  onClick={() => handleStartConversation(profile)}
                >
                  <div className="avatar-sm" style={{ width: 36, height: 36, flexShrink: 0 }}>
                    {isLoading
                      ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                      : (profile.username ?? '?')[0].toUpperCase()
                    }
                  </div>
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>@{profile.username}</span>
                  {isLoading && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                      Opening…
                    </span>
                  )}
                </div>
              )
            })}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                No users found
              </p>
            )}

            {searchQuery.length < 2 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textAlign: 'center', padding: '8px 0' }}>
                Type at least 2 characters to search
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
