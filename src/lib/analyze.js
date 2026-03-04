/**
 * CeliScan — 3-Phase Gluten Analysis Pipeline
 *
 * Phase 1 — Product Identification (GPT-4o-mini, low-detail image)
 *   Fast, cheap call to extract product name, brand, and barcode.
 *
 * Phase 2 — Web Database Lookup (Open Food Facts, free, no key)
 *   Search by barcode first (exact), fall back to product name.
 *   Retrieves verified ingredients, allergen tags, and GF certifications.
 *
 * Phase 3 — Full Gluten Analysis (GPT-4o, high-detail image)
 *   Analyzes the image WITH the database context injected into the prompt.
 *   GPT-4o cross-references what it reads in the photo against the
 *   authoritative database data, producing a highly accurate result.
 */

import OpenAI from 'openai'
import { searchByBarcode, searchByName } from './openFoodFacts'

function getClient() {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey)
    throw new Error(
      'VITE_OPENAI_API_KEY is not configured. Add it to your .env file.',
    )
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
}

// ─── Phase 1: Quick product identification ────────────────────────────────────

const IDENTIFY_SYSTEM =
  `You are a product identification AI. Extract product identity data from food ` +
  `packaging images. Output valid JSON only — no markdown, no extra text.`

const IDENTIFY_PROMPT =
  `Identify this food product from the image. Return ONLY this JSON ` +
  `(use null for any field you cannot determine):\n` +
  `{\n` +
  `  "product_name": "exact product name as printed",\n` +
  `  "brand": "brand or manufacturer name or null",\n` +
  `  "barcode": "EAN/UPC digits if clearly readable or null",\n` +
  `  "variant": "flavor, size, or variant descriptor or null",\n` +
  `  "confidence": 0\n` +
  `}\n` +
  `The "confidence" field is an integer 0–100 reflecting how certain you are ` +
  `about the product identity.`

/**
 * Phase 1 — identify the product using a fast, cheap gpt-4o-mini call.
 * Never throws — returns a blank identification object on failure.
 * @param {string} base64
 * @returns {Promise<Identification>}
 */
async function identifyProduct(base64) {
  const client = getClient()
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: IDENTIFY_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              // Low detail is enough to read brand/name/barcode
              image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'low' },
            },
            { type: 'text', text: IDENTIFY_PROMPT },
          ],
        },
      ],
      max_tokens: 250,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(res.choices[0].message.content)
    return {
      product_name: parsed.product_name || null,
      brand:        parsed.brand        || null,
      barcode:      parsed.barcode      || null,
      variant:      parsed.variant      || null,
      confidence:   Number(parsed.confidence) || 0,
    }
  } catch {
    // Non-fatal: proceed to database lookup with empty identification
    return { product_name: null, brand: null, barcode: null, variant: null, confidence: 0 }
  }
}

// ─── Phase 2: Open Food Facts lookup ─────────────────────────────────────────

/**
 * Phase 2 — look up the product in Open Food Facts.
 * Tries barcode first (most accurate), falls back to name search.
 * @param {Identification} id
 * @returns {Promise<NormalizedProduct|null>}
 */
async function lookupOnline(id) {
  if (id?.barcode) {
    const result = await searchByBarcode(id.barcode)
    if (result) return { ...result, match_type: 'barcode' }
  }

  if (id?.product_name) {
    const result = await searchByName(id.product_name, id.brand)
    if (result) return { ...result, match_type: 'name' }
  }

  return null
}

// ─── Phase 3: Full gluten analysis ───────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are CeliScan, the world's most accurate AI system for celiac disease food safety. Your job is to protect celiac patients from accidental gluten exposure.

━━ GLUTEN SOURCES TO CHECK ━━
DEFINITE: wheat, whole wheat, wheat flour, enriched flour, wheat starch, wheat germ, wheat bran, wheat berries, durum, semolina, spelt, kamut, einkorn, emmer, farro, triticale, barley, barley malt, malt extract, malt syrup, malt vinegar, malt flavoring, rye, seitan, fu, bulgur, couscous, freekeh, hydrolyzed wheat protein, brewer's yeast
UNCERTAIN: oats / oat flour / oat bran (safe ONLY if labeled "certified gluten-free"), modified food starch (safe only if source stated as corn, potato, or tapioca)

━━ CERTAINTY SCORING ━━
92–100% → Barcode-matched database record confirms status + label readable
85–91%  → Database allergen/label data confirms status (name match)
72–84%  → Database has ingredients text, cross-referenced with image
60–71%  → Ingredient list clearly readable from image, product recognized
40–59%  → Partial ingredient visibility + strong training knowledge
0–39%   → Poor image quality, unrecognizable product, no database match

━━ DATABASE OVERRIDE RULES ━━
• If the database allergen tags explicitly include gluten/wheat/barley/rye → status MUST be "unsafe" (unless image clearly shows a different certified-GF variant of the product)
• If the database labels include a gluten-free certification → status may be "safe" with high certainty
• Database data takes priority over visual reading when they conflict

━━ SAFETY RULE ━━
Never guess "safe" when uncertain. Default to "uncertain". Protect the patient.`

/**
 * Build the user-facing analysis prompt, injecting Phase 2 database context.
 */
function buildAnalysisPrompt(id, offData) {
  const dbSection = offData
    ? [
        '══════════════════════════════════════',
        'VERIFIED PRODUCT DATABASE (Open Food Facts)',
        '══════════════════════════════════════',
        `Product : ${offData.product_name ?? id?.product_name ?? 'Unknown'}`,
        `Brand   : ${offData.brand ?? id?.brand ?? 'Unknown'}`,
        `Match   : ${offData.match_type === 'barcode' ? '✓✓ Exact barcode match' : '✓ Name search match'}`,
        '',
        offData.has_gluten
          ? '⚠️  ALLERGEN STATUS: CONTAINS GLUTEN — confirmed in product database'
          : offData.is_gluten_free
            ? '✅  ALLERGEN STATUS: GLUTEN FREE — certified label confirmed in database'
            : '⬜  ALLERGEN STATUS: Not flagged as gluten-containing in database',
        '',
        offData.certifications.length
          ? `Certifications: ${offData.certifications.join(', ')}`
          : 'Certifications: None listed',
        '',
        offData.ingredients_text
          ? `Database ingredients:\n${offData.ingredients_text}`
          : 'Database ingredients: Not available for this product',
        '══════════════════════════════════════',
        '',
        'Cross-reference the database data above with what you can read in the image.',
        'Note any discrepancies (e.g., image shows a GF variant not reflected in database).',
      ].join('\n')
    : [
        '══════════════════════════════════════',
        'PRODUCT DATABASE: No match found',
        '══════════════════════════════════════',
        `Identified: ${id?.product_name ?? 'Unknown product'} by ${id?.brand ?? 'unknown brand'}`,
        `Identification confidence: ${id?.confidence ?? 0}%`,
        '',
        'No database record — analyze carefully from the image.',
        'Use your training knowledge of this product and brand.',
        '══════════════════════════════════════',
      ].join('\n')

  return `${dbSection}

Analyze this food product image for celiac/gluten-free safety.

Read ALL visible text: ingredients list, allergen warnings, certifications, fine print.
Translate any non-English text to English before analysis.
For any text that is blurry or cut off, use context and training knowledge to fill gaps.

Respond with ONLY valid JSON — no markdown, no text outside the object:
{
  "product_name": "full product name and variant",
  "brand": "brand name or null",
  "gluten_status": "safe" or "unsafe" or "uncertain",
  "certainty_percentage": integer 0-100,
  "ingredients": ["complete ingredient list translated to English"],
  "gluten_sources": ["exact gluten-containing ingredients found"],
  "cross_contamination": true or false,
  "cross_contamination_note": "exact warning text or null",
  "analysis_notes": "2-3 sentences: what source(s) led to your conclusion",
  "ingredients_visible": true or false,
  "identified_from_training": true or false,
  "certifications": ["GF certifications seen in image or confirmed from database"],
  "data_source": one of "database_barcode" | "database_name" | "training_knowledge" | "label_scan" | "combined"
}`
}

/**
 * Phase 3 — run the full GPT-4o gluten analysis with database context injected.
 * @param {string} base64
 * @param {Identification} id
 * @param {NormalizedProduct|null} offData
 * @returns {Promise<object>}
 */
async function runGlutenAnalysis(base64, id, offData) {
  const client = getClient()

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
              detail: 'high',
            },
          },
          { type: 'text', text: buildAnalysisPrompt(id, offData) },
        ],
      },
    ],
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  })

  try {
    return JSON.parse(response.choices[0].message.content)
  } catch {
    throw new Error('OpenAI returned invalid JSON. Please try again.')
  }
}

// ─── Image compression (unchanged) ───────────────────────────────────────────

/**
 * Compress the image to max 1920px while preserving quality for label reading.
 * @param {File} file
 * @returns {Promise<{ base64: string, preview: string }>}
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1920
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width >= height) {
            height = Math.round((height / width) * MAX)
            width = MAX
          } else {
            width = Math.round((width / height) * MAX)
            height = MAX
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        resolve({ base64: dataUrl.split(',')[1], preview: e.target.result })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Full 3-phase gluten analysis pipeline.
 *
 * Step callback milestones (pass React setState or any function):
 *   onStep(0) → Phase 1 starting (product identification)
 *   onStep(1) → Phase 1 done, Phase 2 starting (database search)
 *   onStep(2) → Phase 2 done (database result ready)
 *   onStep(3) → Phase 3 starting (GPT-4o full analysis)
 *   onStep(4) → Phase 3 done (normalizing result)
 *   After return, caller should call onStep(STEP_COUNT) to mark all complete.
 *
 * @param {string} base64 - JPEG base64 string (no data URL prefix)
 * @param {function} onStep - Called with step index at each phase transition
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeProductForGluten(base64, onStep = () => {}) {
  // ── Phase 1 ──────────────────────────────────────────────────────────────
  onStep(0)
  const identification = await identifyProduct(base64)

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  onStep(1)
  const offData = await lookupOnline(identification)
  onStep(2)

  // ── Phase 3 ──────────────────────────────────────────────────────────────
  onStep(3)
  const raw = await runGlutenAnalysis(base64, identification, offData)
  onStep(4)

  // ── Normalize & apply database overrides ─────────────────────────────────
  let status = ['safe', 'unsafe', 'uncertain'].includes(raw.gluten_status)
    ? raw.gluten_status
    : 'uncertain'

  let certainty = Math.min(100, Math.max(0, Number(raw.certainty_percentage) || 50))

  // Database-confirmed unsafe: hard override (never let AI say "safe" when DB says "contains gluten")
  if (offData?.has_gluten && status !== 'unsafe') {
    status = 'unsafe'
    certainty = Math.max(certainty, 88)
  }

  // Database-confirmed gluten-free: boost confidence if AI agrees
  if (offData?.is_gluten_free && status !== 'unsafe') {
    status = 'safe'
    certainty = Math.max(certainty, 90)
  }

  // Merge certifications from database + AI (deduplicated)
  const mergedCerts = [
    ...(offData?.certifications ?? []),
    ...(Array.isArray(raw.certifications) ? raw.certifications : []),
  ]

  return {
    // Core result
    product_name:          raw.product_name || offData?.product_name || identification?.product_name || 'Unknown Product',
    brand:                 raw.brand        || offData?.brand        || identification?.brand        || null,
    gluten_status:         status,
    certainty_percentage:  certainty,
    ingredients:           Array.isArray(raw.ingredients)    ? raw.ingredients    : [],
    gluten_sources:        Array.isArray(raw.gluten_sources) ? raw.gluten_sources : [],
    cross_contamination:   Boolean(raw.cross_contamination),
    cross_contamination_note: raw.cross_contamination_note || null,
    analysis_notes:        raw.analysis_notes || '',
    ingredients_visible:   raw.ingredients_visible !== false,
    identified_from_training: Boolean(raw.identified_from_training),
    certifications:        [...new Set(mergedCerts)],

    // Provenance fields (used by ResultCard to show source badge)
    database_match:      offData !== null,
    database_match_type: offData?.match_type || null,   // 'barcode' | 'name' | null
    off_url:             offData?.off_url    || null,
    data_source:         raw.data_source    || (offData ? 'combined' : 'label_scan'),
  }
}
