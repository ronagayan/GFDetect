import { Globe, ScanLine, Clock } from 'lucide-react'

const TABS = [
  { id: 'social',  label: 'Social',  Icon: Globe    },
  { id: 'scan',    label: 'Scan',    Icon: ScanLine  },
  { id: 'history', label: 'History', Icon: Clock    },
]

export default function Navbar({ activeTab, onTabChange }) {
  return (
    <nav className="navbar">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id
        const isScan = id === 'scan'

        return (
          <button
            key={id}
            className={`nav-btn${active ? ' active' : ''}${isScan ? ' scan-tab' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
          >
            {isScan ? (
              /* Scan tab: purple circle + label below — no more floating orphan */
              <>
                <span className={`nav-btn-scan${active ? ' active' : ''}`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className="nav-btn-label">{label}</span>
              </>
            ) : (
              /* Social / History tabs */
              <>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span className="nav-btn-label">{label}</span>
              </>
            )}
          </button>
        )
      })}
    </nav>
  )
}
