import { useState } from 'react'
import { X, Mail, Lock, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess('Check your email for a confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h2 className="modal-title">
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="modal-sub">
              {mode === 'signin'
                ? 'Sign in to save your scan history and share with the community.'
                : 'Join CeliScan to sync your history and share product scans.'}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ flexShrink: 0, marginTop: 2 }}>
            <X size={16} />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}
        {success && (
          <div style={{ padding: '10px 12px', background: 'var(--safe-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--r-sm)', color: 'var(--safe)', fontSize: '0.82rem', marginBottom: 12 }}>
            {success}
          </div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div style={{ position: 'relative' }}>
            <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="email"
              className="input"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ paddingLeft: 36 }}
              autoComplete="email"
            />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ paddingLeft: 36 }}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: 4 }}>
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Please wait...</>
              : mode === 'signin' ? 'Sign In' : 'Create Account'
            }
          </button>
        </form>

        <div className="modal-footer">
          <p className="modal-toggle">
            {mode === 'signin'
              ? <>Don't have an account? <button type="button" onClick={() => setMode('signup')}>Sign up free</button></>
              : <>Already have an account? <button type="button" onClick={() => setMode('signin')}>Sign in</button></>
            }
          </p>
          <div className="divider" style={{ width: '100%' }}>or</div>
          <button className="btn btn-secondary btn-full" onClick={onClose}>
            Continue without account
          </button>
        </div>
      </div>
    </div>
  )
}
