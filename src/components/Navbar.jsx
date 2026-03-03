import { Globe, ScanLine, Clock } from 'lucide-react'

const TABS = [
  { id: 'social',  label: 'Social',  Icon: Globe  },
  { id: 'scan',    label: 'Scan',    Icon: ScanLine },
  { id: 'history', label: 'History', Icon: Clock  },
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
            className={`nav-btn${active ? ' active' : ''}${isScan ? ' ' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
          >
            {isScan ? (
              <span className={`nav-btn-scan${active ? ' active' : ''}`}>
                <Icon size={22} strokeWidth={2.2} />
              </span>
            ) : (
              <>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </button>
        )
      })}
    </nav>
  )
}
