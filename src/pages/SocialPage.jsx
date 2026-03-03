import { useState, useEffect, useCallback } from 'react'
import { Globe, RefreshCw, Loader2 } from 'lucide-react'
import { fetchPublicScans } from '../lib/supabase'
import { useApp } from '../App'
import ScanCard from '../components/ScanCard'

const FILTERS = [
  { id: 'all',      label: 'All Scans' },
  { id: 'safe',     label: '✓ Safe' },
  { id: 'unsafe',   label: '✗ Unsafe' },
  { id: 'uncertain',label: '? Uncertain' },
]

export default function SocialPage() {
  const { showAuthModal } = useApp()
  const [scans, setScans]       = useState([])
  const [filter, setFilter]     = useState('all')
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState(null)
  const [hasMore, setHasMore]   = useState(true)
  const [page, setPage]         = useState(0)

  const load = useCallback(async (reset = false) => {
    const nextPage = reset ? 0 : page
    try {
      const data = await fetchPublicScans(filter, nextPage, 15)
      if (reset) {
        setScans(data)
      } else {
        setScans(prev => [...prev, ...data])
      }
      setHasMore(data.length === 15)
      setPage(reset ? 1 : nextPage + 1)
    } catch (err) {
      setError('Failed to load community feed.')
      console.error(err)
    }
  }, [filter, page])

  // Reload when filter changes
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

  const loadMore = async () => {
    await load(false)
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
          <RefreshCw size={15} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}} />
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
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--text-dim)' }}>
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
          <ScanCard key={scan.id} scan={scan} />
        ))}

        {!loading && hasMore && scans.length > 0 && (
          <button className="btn btn-secondary btn-full" onClick={loadMore}>
            Load more
          </button>
        )}

        {/* CTA for sharing */}
        <div className="card card-p" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--purple-l)', lineHeight: 1.6, marginBottom: 10 }}>
            Help the celiac community! Scan a product and share your results.
          </p>
          <button className="btn btn-primary btn-sm" onClick={showAuthModal}>
            Join & Share
          </button>
        </div>
      </div>
    </div>
  )
}
