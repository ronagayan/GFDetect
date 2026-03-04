import OpenAI from 'openai'

function getClient() {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not configured. Add it to your .env file.')
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
}

const SYSTEM_PROMPT = `You are CeliScan, the world's most accurate AI system for celiac disease food safety. Your job is to protect celiac patients from accidental gluten exposure.

Your analysis runs in TWO PHASES:

━━ PHASE 1: PRODUCT IDENTIFICATION ━━
Use ALL available visual signals to identify the product:
• Brand logo, product name, variant/flavor, packaging colors and design
• Barcode or QR code numbers (read them if visible — they uniquely identify products)
• Product category, size, and form factor
• Your training knowledge of this exact product

━━ PHASE 2: GLUTEN ANALYSIS ━━
Use BOTH what you can read AND what you know:
• Read every word of the ingredient list — look carefully at small text
• Translate all non-English text to English before analysis
• Cross-reference with your training knowledge of this specific product and variant
• For partially visible ingredients: fill gaps intelligently using product knowledge
• For well-known products (Barilla, Nestlé, Kellogg's, Lay's, etc.): actively apply your knowledge of their standard formulations

━━ GLUTEN SOURCES TO CHECK ━━
DEFINITE: wheat, whole wheat, wheat flour, enriched flour, wheat starch, wheat germ, wheat bran, wheat berries, durum, semolina, spelt, kamut, einkorn, emmer, farro, triticale, barley, barley malt, malt extract, malt syrup, malt vinegar, malt flavoring, rye, seitan, fu, bulgur, couscous, freekeh, hydrolyzed wheat protein, brewer's yeast
UNCERTAIN: oats / oat flour / oat bran (safe ONLY if labeled "certified gluten-free"), modified food starch (safe only if source stated as corn, potato, or tapioca)

━━ CERTAINTY SCORING ━━
95–100% → Ingredient list clearly readable AND product confirmed from training data
80–94%  → Ingredient list clearly readable OR strong product identification from training
60–79%  → Partial ingredient visibility + good product recognition
40–59%  → Limited visibility, mostly relying on product knowledge
0–39%   → Poor image quality or unrecognizable product

━━ SAFETY RULE ━━
Never guess "safe" when uncertain. Default to "uncertain". Protect the patient.`

const USER_PROMPT = `Analyze this food product image for celiac/gluten-free safety.

Follow these steps:

STEP 1 — Full visual scan
Look at the entire image. Identify: brand, product name, variant/flavor, packaging, any barcodes or QR codes, country of origin, certifications (gluten-free logo, etc.).

STEP 2 — Apply training knowledge
Do you recognize this product? If yes, what do you know about its ingredients from your training data? Note whether this is a standard variant or a special edition that might differ.

STEP 3 — Read all ingredient text
Zoom into the ingredient panel mentally. Read every word, including small print. Translate any non-English text. Note if ingredients are partially cut off or blurry.

STEP 4 — Check for warnings
Look for: "contains wheat/gluten", "may contain wheat/gluten", "produced in a facility with wheat", "shared equipment", allergen declarations.

STEP 5 — Make determination
Combine your image reading + training knowledge. Be specific about which source led to your conclusion.

Respond with ONLY valid JSON — no markdown, no text outside the JSON:
{
  "product_name": "full product name and variant (e.g. 'Barilla Penne Rigate No.72')",
  "brand": "brand name or null",
  "gluten_status": "safe" or "unsafe" or "uncertain",
  "certainty_percentage": integer 0-100,
  "ingredients": ["complete ingredient list, translated to English"],
  "gluten_sources": ["exact gluten ingredients found, e.g. 'wheat semolina'"],
  "cross_contamination": true or false,
  "cross_contamination_note": "exact warning text or null",
  "analysis_notes": "2-3 sentences: what you read from the label + what you knew from training + why you chose this status",
  "ingredients_visible": true or false,
  "identified_from_training": true or false,
  "certifications": ["any GF certifications seen, e.g. 'Crossed Grain Symbol'"]
}`

/**
 * Compress image while preserving enough resolution to read ingredient labels.
 * Uses a higher max size (1920px) and quality (0.92) than before.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        // Use 1920px max to preserve label text legibility
        const MAX = 1920
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round((height / width) * MAX); width = MAX }
          else { width = Math.round((width / height) * MAX); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        // Higher quality (0.92) to preserve small text on labels
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        resolve({ base64: dataUrl.split(',')[1], preview: e.target.result })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Analyze a product image for gluten content using GPT-4o vision.
 * @param {string} base64 - JPEG image as base64 string (no data URL prefix)
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeProductForGluten(base64) {
  const client = getClient()

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
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
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  })

  let raw
  try {
    raw = JSON.parse(response.choices[0].message.content)
  } catch {
    throw new Error('OpenAI returned invalid JSON. Please try again.')
  }

  const status = ['safe', 'unsafe', 'uncertain'].includes(raw.gluten_status)
    ? raw.gluten_status
    : 'uncertain'

  return {
    product_name: raw.product_name || 'Unknown Product',
    brand: raw.brand || null,
    gluten_status: status,
    certainty_percentage: Math.min(100, Math.max(0, Number(raw.certainty_percentage) || 50)),
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
    gluten_sources: Array.isArray(raw.gluten_sources) ? raw.gluten_sources : [],
    cross_contamination: Boolean(raw.cross_contamination),
    cross_contamination_note: raw.cross_contamination_note || null,
    analysis_notes: raw.analysis_notes || '',
    ingredients_visible: raw.ingredients_visible !== false,
    identified_from_training: Boolean(raw.identified_from_training),
    certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
  }
}
