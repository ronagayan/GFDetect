import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, ScanLine } from 'lucide-react'
import { useApp } from '../App'
import { compressImage, analyzeProductForGluten } from '../lib/analyze'
import { saveScan, makeScanPublic } from '../lib/supabase'
import ResultCard from '../components/ResultCard'
import LoadingSteps from '../components/LoadingSteps'

// Must match the number of STEPS in LoadingSteps.jsx
const STEP_COUNT = 5

export default function ScanPage() {
  const { user, showAuthModal } = useApp()
  const [image, setImage] = useState(null)     // { preview, base64 }
  const [analyzing, setAnalyzing] = useState(false)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState(null)
  const [savedScanId, setSavedScanId] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const handleFile = useCallback(async file => {
    if (!file?.type.startsWith('image/')) return
    setResult(null)
    setError(null)
    setSavedScanId(null)
    try {
      const processed = await compressImage(file)
      setImage(processed)
    } catch {
      setError('Could not load image. Please try a different file.')
    }
  }, [])

  const handleDrop = useCallback(e => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleAnalyze = async () => {
    if (!image) return
    setAnalyzing(true)
    setError(null)
    setStep(0)

    try {
      // Pass setStep directly — analyze.js calls it at real phase transitions:
      // 0 → identifying, 1 → searching DB, 2 → DB done, 3 → analyzing, 4 → normalizing
      const analysis = await analyzeProductForGluten(image.base64, setStep)
      setStep(STEP_COUNT)  // mark all steps complete
      setResult(analysis)

      // Save to Supabase if user is signed in
      if (user) {
        try {
          const scan = await saveScan({ userId: user.id, imageBase64: image.base64, analysis })
          setSavedScanId(scan?.id ?? null)
        } catch (saveErr) {
          console.warn('Failed to save scan:', saveErr)
        }
      }
    } catch (err) {
      setError(err.message || 'Analysis failed. Check your OpenAI API key and try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleShare = async () => {
    if (!user) { showAuthModal(); return }
    if (!savedScanId) return
    await makeScanPublic(savedScanId)
  }

  const reset = () => {
    setImage(null)
    setResult(null)
    setError(null)
    setAnalyzing(false)
    setStep(0)
    setSavedScanId(null)
    if (fileRef.current) fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <div className="app-logo">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="9" fill="url(#lg)" />
            <path d="M16 7C16 7 10 11 10 17a6 6 0 0012 0c0-6-6-10-6-10z" fill="white" opacity="0.9"/>
            <path d="M16 13v8M13 16l3-3 3 3" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8b5cf6"/><stop offset="1" stopColor="#3b82f6"/>
              </linearGradient>
            </defs>
          </svg>
          CeliScan
        </div>
        {user ? (
          <button className="avatar-btn" title={user.email} onClick={() => import('../lib/supabase').then(m => m.supabase.auth.signOut())}>
            {user.email?.[0]?.toUpperCase() ?? '?'}
          </button>
        ) : (
          <button className="sign-in-btn" onClick={showAuthModal}>Sign In</button>
        )}
      </header>

      <div className="page-scroll">
        {/* Upload zone */}
        {!image && !result && !analyzing && (
          <UploadZone
            onFile={handleFile}
            onDrop={handleDrop}
            onCameraClick={() => cameraRef.current?.click()}
            onUploadClick={() => fileRef.current?.click()}
          />
        )}

        {/* Image preview + analyze button */}
        {image && !result && !analyzing && (
          <ImagePreview src={image.preview} onAnalyze={handleAnalyze} onReset={reset} />
        )}

        {/* Loading steps */}
        {analyzing && <LoadingSteps currentStep={step} imageSrc={image?.preview} />}

        {/* Result */}
        {result && (
          <ResultCard
            result={result}
            imageSrc={image?.preview}
            onReset={reset}
            onShare={savedScanId ? handleShare : null}
            scanId={savedScanId}
          />
        )}

        {/* Error */}
        {error && (
          <div className="error-box">
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={result ? () => setError(null) : reset}>
              {result ? 'Dismiss' : 'Try Again'}
            </button>
          </div>
        )}

        {/* Sign-in nudge when not logged in and result shown */}
        {result && !user && (
          <div className="card card-p" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <p style={{ fontSize: '0.83rem', color: 'var(--purple-l)', marginBottom: 10, lineHeight: 1.5 }}>
              <strong>Sign in</strong> to save your scan history and share with the celiac community.
            </p>
            <button className="btn btn-primary btn-sm" onClick={showAuthModal}>
              Sign In / Sign Up
            </button>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={fileRef}   type="file" accept="image/*"                    hidden onChange={e => handleFile(e.target.files[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => handleFile(e.target.files[0])} />
    </div>
  )
}

function UploadZone({ onFile, onDrop, onCameraClick, onUploadClick }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
      <div
        className="scan-zone"
        style={dragOver ? { borderColor: 'var(--purple)', background: 'var(--surface-3)' } : {}}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { setDragOver(false); onDrop(e) }}
        onClick={onUploadClick}
      >
        <div className="scan-icon-ring">
          <ScanLine size={38} strokeWidth={1.5} />
        </div>
        <div className="scan-zone-title">Scan a Product</div>
        <p className="scan-zone-sub">
          Take a photo or upload from gallery.<br />
          AI will check for gluten instantly.
        </p>
        <div className="scan-zone-actions" onClick={e => e.stopPropagation()}>
          <button className="btn btn-primary" onClick={onCameraClick}>
            <Camera size={15} /> Camera
          </button>
          <button className="btn btn-secondary" onClick={onUploadClick}>
            <Upload size={15} /> Upload
          </button>
        </div>
      </div>

      {/* Tips */}
      <div className="card card-p" style={{ background: 'var(--surface-2)' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 10 }}>
          Tips for best results
        </p>
        {[
          'Point camera at the ingredient list',
          'Ensure text is clearly visible & in focus',
          'Works with any language — auto-translates',
          'Check both front label and ingredients',
        ].map((tip, i) => (
          <p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
            <span style={{ color: 'var(--purple-l)', fontWeight: 700, flexShrink: 0 }}>✓</span>
            {tip}
          </p>
        ))}
      </div>
    </div>
  )
}

function ImagePreview({ src, onAnalyze, onReset }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="img-preview-wrap">
        <img className="img-preview" src={src} alt="Product to scan" />
        <div className="img-preview-overlay">
          <button className="btn-icon" onClick={onReset} title="Remove">
            <X size={15} />
          </button>
        </div>
      </div>
      <button className="btn btn-primary btn-full" onClick={onAnalyze} style={{ fontSize: '1rem', padding: '14px' }}>
        <ScanLine size={18} /> Analyze for Gluten
      </button>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center' }}>
        Powered by GPT-4o Vision · Results may vary
      </p>
    </div>
  )
}
