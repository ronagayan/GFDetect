import { CheckCircle2, Loader2, Circle } from 'lucide-react'

const STEPS = [
  'Identifying product...',
  'Reading ingredients...',
  'Checking gluten sources...',
  'Verifying cross-contamination...',
  'Calculating certainty...',
]

export default function LoadingSteps({ currentStep, imageSrc }) {
  return (
    <div className="loading-wrap">
      {imageSrc && (
        <div className="loading-image">
          <img src={imageSrc} alt="Scanning..." />
          <div className="loading-image-overlay">
            <div className="loading-spinner" />
          </div>
        </div>
      )}

      <div style={{ width: '100%' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          Analyzing product
        </p>
        <div className="loading-steps">
          {STEPS.map((step, i) => {
            const done   = i < currentStep
            const active = i === currentStep
            return (
              <div
                key={step}
                className={`loading-step${done ? ' done' : active ? ' active' : ''}`}
              >
                <span className="step-indicator">
                  {done
                    ? <CheckCircle2 size={14} />
                    : active
                      ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                      : <Circle size={14} />
                  }
                </span>
                {step}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
