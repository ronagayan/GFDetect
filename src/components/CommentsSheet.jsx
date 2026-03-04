import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2 } from 'lucide-react'
import { fetchComments, addComment, deleteComment } from '../lib/supabase'
import { useApp } from '../App'

function timeAgo(dateString) {
  const diff  = Date.now() - new Date(dateString).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

export default function CommentsSheet({ scan, onClose }) {
  const { user, showAuthModal } = useApp()
  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    fetchComments(scan.id)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [scan.id])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [comments.length])

  const handleSend = async () => {
    if (!user)           { showAuthModal(); return }
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    try {
      const comment = await addComment(user.id, scan.id, content)
      setComments(prev => [...prev, comment])
    } catch (err) {
      console.error('comment error', err)
      setInput(content) // restore on error
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await deleteComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (err) {
      console.error('delete comment error', err)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet comments-sheet"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-handle" />

        <div className="comments-header">
          <span className="comments-title">
            Comments
            {comments.length > 0 && (
              <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: '0.85rem', marginLeft: 6 }}>
                ({comments.length})
              </span>
            )}
          </span>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Comment list */}
        <div className="comments-list" ref={listRef}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-dim)' }} />
            </div>
          )}

          {!loading && comments.length === 0 && (
            <div className="comments-empty">
              <p>No comments yet — be the first!</p>
            </div>
          )}

          {comments.map(comment => (
            <div key={comment.id} className="comment-item">
              <div className="avatar-sm" style={{ flexShrink: 0, marginTop: 2 }}>
                {(comment.profiles?.username ?? '?')[0].toUpperCase()}
              </div>

              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-username">
                    @{comment.profiles?.username ?? 'anonymous'}
                  </span>
                  <span className="comment-time">{timeAgo(comment.created_at)}</span>
                </div>
                <p className="comment-text">{comment.content}</p>
              </div>

              {user?.id === comment.user_id && (
                <button
                  className="comment-delete"
                  onClick={() => handleDelete(comment.id)}
                  aria-label="Delete comment"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Input bar */}
        <div className="comment-input-bar">
          {user ? (
            <div className="avatar-sm" style={{ flexShrink: 0 }}>
              {user.email?.[0]?.toUpperCase() ?? '?'}
            </div>
          ) : null}

          <input
            className="input comment-input"
            placeholder={user ? 'Add a comment…' : 'Sign in to comment'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
            disabled={!user || sending}
            maxLength={500}
          />

          <button
            className="btn btn-primary"
            style={{ padding: '10px 14px', borderRadius: 10, flexShrink: 0 }}
            onClick={user ? handleSend : showAuthModal}
            disabled={sending || (!!user && !input.trim())}
            aria-label="Send comment"
          >
            {sending
              ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Send size={16} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
