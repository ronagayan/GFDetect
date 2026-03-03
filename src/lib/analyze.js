import OpenAI from 'openai'

function getClient() {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not configured. Add it to your .env file.')
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
}

const SYSTEM_PROMPT = `You are CeliScan, an expert AI system specialized in celiac disease and gluten-free food safety.
Your mission is to protect celiac patients by accurately identifying gluten in food products.

You have deep expertise in:
- All gluten-containing grains: wheat (and all varieties: spelt, kamut, einkorn, emmer, durum, farro), barley, rye, triticale
- Hidden gluten sources: malt, malt extract, malt vinegar, brewer's yeast, hydrolyzed wheat protein, modified food starch (unspecified source), semolina, bulgur, couscous, freekeh
- Cross-contamination risks and regulatory labeling requirements (FDA, EU, Codex Alimentarius)
- International ingredient names (Italian, German, French, Spanish, etc.)
- Oats: safe only if certified gluten-free; otherwise uncertain

Safety principle: When in doubt, lower certainty and prefer "uncertain" over "safe". Protect the patient.`

const USER_PROMPT = `Analyze this food product image for celiac safety.

Step 1: Identify the product name and brand.
Step 2: Read ALL ingredient text visible on packaging. Translate any non-English text to English.
Step 3: Check every ingredient against the gluten sources list.
Step 4: Look for cross-contamination warnings ("may contain wheat/gluten", "processed in a facility with...", "shared equipment").
Step 5: Assess your certainty (0-100%) based on: text clarity, ingredient readability, product type knowledge.

Gluten sources checklist:
wheat, flour, whole wheat, wheat starch, wheat germ, wheat bran, wheat berries, enriched flour, durum, semolina, farro, spelt, kamut, einkorn, emmer, triticale,
barley, barley malt, malt extract, malt syrup, malt vinegar, malt flavoring,
rye, oats (unless "certified gluten-free"), brewer's yeast,
hydrolyzed wheat protein, modified food starch (when source not specified as corn/potato/tapioca),
bulgur, couscous, freekeh, seitan, fu

Respond with ONLY valid JSON (absolutely no markdown, no text outside the JSON object):
{
  "product_name": "full product name or 'Unknown Product'",
  "brand": "brand name or null",
  "gluten_status": "safe" or "unsafe" or "uncertain",
  "certainty_percentage": integer 0-100,
  "ingredients": ["full ingredient list extracted from image"],
  "gluten_sources": ["specific gluten ingredients found"],
  "cross_contamination": true or false,
  "cross_contamination_note": "exact warning text or null",
  "analysis_notes": "1-2 sentence explanation of your determination",
  "ingredients_visible": true or false
}`

/**
 * Compress image to max 1024px and convert to base64.
 * Returns { base64, preview } where preview is a data URL for display.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round((height / width) * MAX); width = MAX }
          else { width = Math.round((width / height) * MAX); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
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
    max_tokens: 900,
    response_format: { type: 'json_object' },
  })

  let raw
  try {
    raw = JSON.parse(response.choices[0].message.content)
  } catch {
    throw new Error('OpenAI returned invalid JSON. Please try again.')
  }

  // Normalize & validate
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
  }
}
