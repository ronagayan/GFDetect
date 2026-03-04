import { Globe, ScanLine, Clock, MessageCircle } from 'lucide-react'

const TABS = [
  { id: 'social',   label: 'Social',   Icon: Globe          },
  { id: 'scan',     label: 'Scan',     Icon: ScanLine       },
  { id: 'messages', label: 'Messages', Icon: MessageCircle  },
  { id: 'history',  label: 'History',  Icon: Clock          },
]

export default function Navbar({ activeTab, onTabChange, unreadCount = 0 }) {
  return (
    <nav className="navbar">
      {TABS.map(({ id, label, Icon }) => {
        const active    = activeTab === id
        const isScan    = id === 'scan'
        const showBadge = id === 'messages' && unreadCount > 0

        return (
          <button
            key={id}
            className={`nav-btn${active ? ' active' : ''}${isScan ? ' scan-tab' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
          >
            {isScan ? (
              <>
                <span className={`nav-btn-scan${active ? ' active' : ''}`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className="nav-btn-label">{label}</span>
              </>
            ) : (
              <>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                  {showBadge && (
                    <span className="nav-badge">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="nav-btn-label">{label}</span>
              </>
            )}
          </button>
        )
      })}
    </nav>
  )
}
