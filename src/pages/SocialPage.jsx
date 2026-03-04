import { useState, useEffect, useCallback } from 'react'
import { Globe, RefreshCw, Loader2 } from 'lucide-react'
import { fetchPublicScans, toggleLike, fetchUserLikedScanIds } from '../lib/supabase'
import { useApp } from '../App'
import ScanCard from '../components/ScanCard'
import CommentsSheet from '../components/CommentsSheet'

const FILTERS = [
  { id: 'all',       label: 'All Scans'  },
  { id: 'safe',      label: '✓ Safe'     },
  { id: 'unsafe',    label: '✗ Unsafe'   },
  { id: 'uncertain', label: '? Uncertain'},
]

export default function SocialPage() {
  const { user, showAuthModal } = useApp()

  const [scans, setScans]             = useState([])
  const [likedIds, setLikedIds]       = useState(new Set())
  const [filter, setFilter]           = useState('all')
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [error, setError]             = useState(null)
  const [hasMore, setHasMore]         = useState(true)
  const [page, setPage]               = useState(0)
  const [commentsFor, setCommentsFor] = useState(null) // scan object

  /* ── Load liked IDs whenever user changes ── */
  useEffect(() => {
    if (!user) { setLikedIds(new Set()); return }
    fetchUserLikedScanIds(user.id).then(setLikedIds).catch(console.error)
  }, [user?.id])

  /* ── Load feed on filter change ── */
  useEffect(() => {
    setLoading(true)
    setPage(0)
    fetchPublicScans(filter, 0, 15)
      .then(data => {
        setScans(data)
        setHasMore(data.length === 15)
        setPage(1)
        setError(null)
      })
      .catch(() => setError('Failed to load community feed.'))
      .finally(() => setLoading(false))
  }, [filter])

  const handleRefresh = async () => {
    setRefreshing(true)
    setPage(0)
    try {
      const data = await fetchPublicScans(filter, 0, 15)
      setScans(data)
      setHasMore(data.length === 15)
      setPage(1)
      setError(null)
    } catch {
      setError('Failed to refresh.')
    } finally {
      setRefreshing(false)
    }
  }

  const loadMore = useCallback(async () => {
    try {
      const data = await fetchPublicScans(filter, page, 15)
      setScans(prev => [...prev, ...data])
      setHasMore(data.length === 15)
      setPage(p => p + 1)
    } catch (err) {
      setError('Failed to load more.')
      console.error(err)
    }
  }, [filter, page])

  /* ── Like / unlike with optimistic UI ── */
  const handleLike = async (scan) => {
    if (!user) { showAuthModal(); return }

    const wasLiked = likedIds.has(scan.id)
    const delta    = wasLiked ? -1 : 1

    // Optimistic
    setLikedIds(prev => {
      const next = new Set(prev)
      wasLiked ? next.delete(scan.id) : next.add(scan.id)
      return next
    })
    setScans(prev =>
      prev.map(s =>
        s.id === scan.id
          ? { ...s, like_count: Math.max(0, (s.like_count ?? 0) + delta) }
          : s
      )
    )

    try {
      await toggleLike(user.id, scan.id)
    } catch (err) {
      // Revert on failure
      setLikedIds(prev => {
        const next = new Set(prev)
        wasLiked ? next.add(scan.id) : next.delete(scan.id)
        return next
      })
      setScans(prev =>
        prev.map(s =>
          s.id === scan.id
            ? { ...s, like_count: Math.max(0, (s.like_count ?? 0) - delta) }
            : s
        )
      )
      console.error('like error', err)
    }
  }

  /* ── Web Share / clipboard ── */
  const handleShare = async (scan) => {
    const status =
      scan.gluten_status === 'safe'    ? '✅ Gluten Free'      :
      scan.gluten_status === 'unsafe'  ? '⛔ Contains Gluten'  :
                                         '⚠️ Uncertain'
    const text = `${scan.product_name}${scan.brand ? ` by ${scan.brand}` : ''} — ${status} (${scan.certainty_percentage}% certainty) via CeliScan`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: scan.product_name, text }) } catch { /* cancelled */ }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text)
        // Could show a toast; for now silently succeeds
      } catch { /* ignore */ }
    }
  }

  /* ── Comment count update after sheet closes ── */
  const handleCommentUpdate = (scanId, newCount) => {
    setScans(prev =>
      prev.map(s => s.id === scanId ? { ...s, comment_count: newCount } : s)
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={18} style={{ color: 'var(--purple-l)' }} />
          <h1>Community</h1>
        </div>
        <button
          className="btn-icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh"
        >
          <RefreshCw
            size={15}
            style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}}
          />
        </button>
      </header>

      {/* Filters */}
      <div style={{ padding: '12px 16px 0' }}>
        <div className="feed-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-pill${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-scroll">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-dim)' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {!loading && error && (
          <div className="error-box">
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={handleRefresh}>Retry</button>
          </div>
        )}

        {!loading && !error && scans.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Globe size={28} /></div>
            <h3>No community scans yet</h3>
            <p>Be the first to scan a product and share it with the celiac community!</p>
          </div>
        )}

        {!loading && scans.map(scan => (
          <ScanCard
            key={scan.id}
            scan={scan}
            liked={likedIds.has(scan.id)}
            onLike={() => handleLike(scan)}
            onComment={() => setCommentsFor(scan)}
            onShare={() => handleShare(scan)}
          />
        ))}

        {!loading && hasMore && scans.length > 0 && (
          <button className="btn btn-secondary btn-full" onClick={loadMore}>
            Load more
          </button>
        )}

        {/* CTA */}
        <div
          className="card card-p"
          style={{
            background: 'var(--purple-dim)',
            border: '1px solid rgba(139,92,246,0.2)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--purple-l)', lineHeight: 1.6, marginBottom: 10 }}>
            Help the celiac community! Scan a product and share your results.
          </p>
          <button className="btn btn-primary btn-sm" onClick={showAuthModal}>
            Join & Share
          </button>
        </div>
      </div>

      {/* Comments bottom sheet */}
      {commentsFor && (
        <CommentsSheet
          scan={commentsFor}
          onClose={() => setCommentsFor(null)}
        />
      )}
    </div>
  )
}
