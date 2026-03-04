import { Heart, MessageCircle as CommentIcon, Share2, ShieldCheck, ShieldX, ShieldAlert, ImageOff } from 'lucide-react'

const STATUS_META = {
  safe:      { label: 'Gluten Free',    Icon: ShieldCheck, color: 'var(--safe)'      },
  unsafe:    { label: 'Contains Gluten', Icon: ShieldX,    color: 'var(--unsafe)'    },
  uncertain: { label: 'Uncertain',       Icon: ShieldAlert, color: 'var(--uncertain)' },
}

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

export default function ScanCard({
  scan,
  liked     = false,
  onLike,
  onComment,
  onShare,
  onClick,
}) {
  const meta     = STATUS_META[scan.gluten_status] ?? STATUS_META.uncertain
  const { Icon } = meta
  const username = scan.profiles?.username ?? scan.username ?? 'anonymous'
  const hasActions = onLike || onComment || onShare

  return (
    <div className="scan-card">
      {/* Tappable area — image + body */}
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        {scan.image_url ? (
          <img
            className="scan-card-img"
            src={scan.image_url}
            alt={scan.product_name}
            loading="lazy"
          />
        ) : (
          <div className="scan-card-img-placeholder">
            <ImageOff size={28} />
          </div>
        )}

        <div className="scan-card-body">
          <div className="scan-card-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="scan-card-name">{scan.product_name}</div>
              {scan.brand && <div className="scan-card-brand">{scan.brand}</div>}
            </div>
            <span className={`badge badge-${scan.gluten_status}`} style={{ flexShrink: 0 }}>
              <Icon size={11} />
              {meta.label}
            </span>
          </div>

          {scan.caption && (
            <p className="scan-card-caption">{scan.caption}</p>
          )}

          <div className="scan-card-meta">
            <div className="scan-card-user">
              <div className="avatar-sm">{username[0]?.toUpperCase()}</div>
              <span>@{username}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="certainty-mini">
                <div className="certainty-bar-wrap">
                  <div
                    className="certainty-bar-fill"
                    style={{ width: `${scan.certainty_percentage}%`, background: meta.color }}
                  />
                </div>
                <span style={{ color: meta.color }}>{scan.certainty_percentage}%</span>
              </div>
              <span>·</span>
              <span>{timeAgo(scan.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social action bar */}
      {hasActions && (
        <div className="scan-card-actions">
          {onLike && (
            <button
              className={`action-btn${liked ? ' liked' : ''}`}
              onClick={onLike}
              aria-label="Like"
            >
              <Heart size={16} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 2} />
              <span>{scan.like_count ?? 0}</span>
            </button>
          )}

          {onComment && (
            <button className="action-btn" onClick={onComment} aria-label="Comments">
              <CommentIcon size={16} />
              <span>{scan.comment_count ?? 0}</span>
            </button>
          )}

          {onShare && (
            <button
              className="action-btn"
              onClick={onShare}
              aria-label="Share"
              style={{ marginLeft: 'auto' }}
            >
              <Share2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
