import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './lib/supabase'
import Navbar from './components/Navbar'
import ScanPage from './pages/ScanPage'
import SocialPage from './pages/SocialPage'
import HistoryPage from './pages/HistoryPage'
import AuthModal from './components/AuthModal'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

function SplashScreen() {
  return (
    <div className="splash">
      <div className="splash-logo">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="10" fill="url(#g)" />
          <path d="M16 7C16 7 10 11 10 17a6 6 0 0012 0c0-6-6-10-6-10z" fill="white" opacity="0.9"/>
          <path d="M16 13v8M13 16l3-3 3 3" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#8b5cf6"/>
              <stop offset="1" stopColor="#3b82f6"/>
            </linearGradient>
          </defs>
        </svg>
        CeliScan
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <div className="splash-dot" />
        <div className="splash-dot" />
        <div className="splash-dot" />
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('scan')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN') setShowAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <SplashScreen />

  return (
    <AppContext.Provider value={{ user, showAuthModal: () => setShowAuth(true), tab, setTab }}>
      <div className="app-root">
        {tab === 'scan'    && <ScanPage    key="scan"    />}
        {tab === 'social'  && <SocialPage  key="social"  />}
        {tab === 'history' && <HistoryPage key="history" />}
        <Navbar activeTab={tab} onTabChange={setTab} />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    </AppContext.Provider>
  )
}
