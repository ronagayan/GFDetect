import { useState, useEffect } from 'react'
import { Clock, ScanLine, ShieldCheck, ShieldX, ShieldAlert, ImageOff, Loader2 } from 'lucide-react'
import { useApp } from '../App'
import { fetchUserScans, getUserScanStats } from '../lib/supabase'
import ScanCard from '../components/ScanCard'

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'safe',      label: 'Safe' },
  { id: 'unsafe',    label: 'Unsafe' },
  { id: 'uncertain', label: 'Uncertain' },
]

function StatCard({ value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value" style={{ color }}>{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  )
}

function HistoryItemRow({ scan }) {
  const STATUS = {
    safe:      { Icon: ShieldCheck, color: 'var(--safe)'     },
    unsafe:    { Icon: ShieldX,     color: 'var(--unsafe)'   },
    uncertain: { Icon: ShieldAlert, color: 'var(--uncertain)' },
  }
  const { Icon, color } = STATUS[scan.gluten_status] ?? STATUS.uncertain

  const date = new Date(scan.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  })

  return (
    <div className="history-item">
      <div className="history-thumb">
        {scan.image_url
          ? <img src={scan.image_url} alt={scan.product_name} />
          : <ImageOff size={18} />
        }
      </div>
      <div className="history-info">
        <div className="history-name">{scan.product_name}</div>
        {scan.brand && <div className="history-brand">{scan.brand}</div>}
        <div className="history-footer">
          <span className={`badge badge-${scan.gluten_status}`} style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
            <Icon size={10} />
            {scan.gluten_status === 'safe' ? 'Safe' : scan.gluten_status === 'unsafe' ? 'Unsafe' : 'Uncertain'}
          </span>
          <span className="history-certainty">{scan.certainty_percentage}% certain</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <Icon size={18} style={{ color }} />
        <span className="history-date">{date}</span>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { user, showAuthModal, setTab } = useApp()
  const [scans, setScans]   = useState([])
  const [stats, setStats]   = useState({ total: 0, safe: 0, unsafe: 0, uncertain: 0 })
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetchUserScans(user.id, filter, 0, 50),
      getUserScanStats(user.id),
    ])
      .then(([data, statsData]) => {
        setScans(data)
        setStats(statsData)
        setError(null)
      })
      .catch(() => setError('Failed to load history.'))
      .finally(() => setLoading(false))
  }, [user, filter])

  if (!user) {
    return (
      <div className="page">
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} style={{ color: 'var(--purple-l)' }} />
            <h1>History</h1>
          </div>
        </header>
        <div className="page-scroll">
          <div className="empty-state">
            <div className="empty-icon"><Clock size={28} /></div>
            <h3>Sign in to see history</h3>
            <p>Your scan history is saved when you're signed in.</p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={showAuthModal}>
              Sign In / Sign Up
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} style={{ color: 'var(--purple-l)' }} />
          <h1>History</h1>
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{stats.total} scan{stats.total !== 1 ? 's' : ''}</span>
      </header>

      <div className="page-scroll">
        {/* Stats */}
        {stats.total > 0 && (
          <div className="stats-row">
            <StatCard value={stats.safe}      label="Safe"      color="var(--safe)"     />
            <StatCard value={stats.unsafe}    label="Unsafe"    color="var(--unsafe)"   />
            <StatCard value={stats.uncertain} label="Uncertain" color="var(--uncertain)" />
          </div>
        )}

        {/* Filters */}
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

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--text-dim)' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="error-box"><p>{error}</p></div>
        )}

        {/* Empty */}
        {!loading && !error && scans.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><ScanLine size={28} /></div>
            <h3>No scans yet</h3>
            <p>
              {filter === 'all'
                ? 'Start scanning products to build your history.'
                : `No ${filter} products scanned yet.`}
            </p>
            {filter === 'all' && (
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setTab('scan')}>
                Scan a Product
              </button>
            )}
          </div>
        )}

        {/* List */}
        {!loading && scans.map(scan => (
          <HistoryItemRow key={scan.id} scan={scan} />
        ))}
      </div>
    </div>
  )
}
