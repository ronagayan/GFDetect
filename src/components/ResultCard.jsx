import { ShieldCheck, ShieldX, ShieldAlert, AlertTriangle, Share2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import CertaintyRing from './CertaintyRing'

const STATUS_META = {
  safe: {
    Icon: ShieldCheck,
    label: 'Gluten Free',
    note: 'No gluten-containing ingredients detected.',
    color: 'var(--safe)',
  },
  unsafe: {
    Icon: ShieldX,
    label: 'Contains Gluten',
    note: 'This product is not safe for celiacs.',
    color: 'var(--unsafe)',
  },
  uncertain: {
    Icon: ShieldAlert,
    label: 'Uncertain',
    note: 'Could not determine with confidence. Proceed with caution.',
    color: 'var(--uncertain)',
  },
}

export default function ResultCard({ result, imageSrc, onReset, onShare, scanId }) {
  const [showIngredients, setShowIngredients] = useState(false)
  const [shared, setShared] = useState(false)

  const meta = STATUS_META[result.gluten_status] ?? STATUS_META.uncertain
  const { Icon } = meta

  const handleShare = async () => {
    if (onShare) {
      await onShare()
      setShared(true)
    }
  }

  const dangerSet = new Set((result.gluten_sources ?? []).map(s => s.toLowerCase()))

  return (
    <div className="result-wrap">
      {/* Hero image */}
      {imageSrc && (
        <div className="result-hero">
          <img src={imageSrc} alt={result.product_name} />
          <div className="result-hero-overlay">
            <div className="result-product-name">{result.product_name}</div>
            {result.brand && <div className="result-brand">{result.brand}</div>}
          </div>
        </div>
      )}

      {/* Status card */}
      <div className={`result-status-card card-glass ${result.gluten_status}`}>
        <div className="result-status-text">
          <div className="result-status-label">Gluten Status</div>
          <div className={`result-status-value ${result.gluten_status}`}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={22} />
              {meta.label}
            </span>
          </div>
          <div className="result-status-note">{meta.note}</div>
        </div>
        <CertaintyRing
          percentage={result.certainty_percentage}
          status={result.gluten_status}
          size={90}
        />
      </div>

      {/* Gluten sources */}
      {result.gluten_sources?.length > 0 && (
        <div className="card card-p">
          <div className="section-title">Gluten Sources Found</div>
          <div className="gluten-source-list">
            {result.gluten_sources.map((src, i) => (
              <div key={i} className="gluten-source-item">
                <ShieldX size={14} />
                {src}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-contamination warning */}
      {result.cross_contamination && result.cross_contamination_note && (
        <div className="cross-cont-banner">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Cross-contamination warning:</strong> {result.cross_contamination_note}</span>
        </div>
      )}

      {/* Ingredients (collapsible) */}
      {result.ingredients?.length > 0 && (
        <div className="card card-p">
          <button
            className="btn-ghost"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, marginBottom: showIngredients ? 12 : 0 }}
            onClick={() => setShowIngredients(v => !v)}
          >
            <span className="section-title" style={{ margin: 0 }}>
              Ingredients ({result.ingredients.length})
            </span>
            {showIngredients ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showIngredients && (
            <div className="ingredient-list" style={{ animation: 'fadeUp 0.2s ease' }}>
              {result.ingredients.map((ing, i) => {
                const isDanger = dangerSet.has(ing.toLowerCase()) ||
                  [...dangerSet].some(d => ing.toLowerCase().includes(d))
                return (
                  <span key={i} className={`ingredient-tag${isDanger ? ' danger' : ''}`}>
                    {ing}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Analysis notes */}
      {result.analysis_notes && (
        <div className="notes-box">
          💬 {result.analysis_notes}
        </div>
      )}

      {/* Ingredient visibility warning */}
      {!result.ingredients_visible && (
        <div className="cross-cont-banner" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(139,92,246,0.2)', color: 'var(--purple-l)' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>Ingredient list not fully readable. Result based on product recognition only.</span>
        </div>
      )}

      {/* Actions */}
      <div className="result-actions">
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onReset}>
          <RefreshCw size={15} /> New Scan
        </button>
        {onShare && !shared && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleShare}>
            <Share2 size={15} /> Share
          </button>
        )}
        {shared && (
          <button className="btn btn-secondary" style={{ flex: 1 }} disabled>
            ✓ Shared!
          </button>
        )}
      </div>
    </div>
  )
}
