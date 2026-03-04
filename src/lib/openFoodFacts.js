/**
 * Open Food Facts API client
 * Free, no API key required, 3M+ products worldwide.
 * Docs: https://wiki.openfoodfacts.org/API
 *
 * Security: HTTPS only, 8 s timeout, outputs sanitized before use.
 * No product images or personal data are ever sent to OFF.
 */

const OFF_BASE = 'https://world.openfoodfacts.org'
const TIMEOUT_MS = 8000
const USER_AGENT = 'CeliScan/1.0 (gluten-detector-pwa; github.com/ronagayan/GFDetect)'

// Gluten-containing allergen tag fragments (OFF uses "en:wheat", "en:gluten", etc.)
const GLUTEN_FRAGMENTS = [
  'gluten', 'wheat', 'barley', 'rye', 'spelt',
  'kamut', 'triticale', 'einkorn', 'emmer', 'farro',
]

// Gluten-free label tag fragments
const GF_LABEL_FRAGMENTS = [
  'gluten-free', 'gluten-frei', 'sans-gluten',
  'sin-gluten', 'senza-glutine', 'glutenvrij',
]

/**
 * Races a fetch against a timeout so the UI never hangs on slow OFF responses.
 */
function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OFF request timed out')), ms),
    ),
  ])
}

/**
 * Look up a product by its barcode (EAN-8, EAN-13, UPC-A, UPC-E, etc.)
 * @param {string|null} barcode
 * @returns {Promise<NormalizedProduct|null>}
 */
export async function searchByBarcode(barcode) {
  if (!barcode) return null
  const clean = String(barcode).replace(/\D/g, '')
  if (clean.length < 8 || clean.length > 14) return null

  try {
    const url =
      `${OFF_BASE}/api/v2/product/${clean}.json` +
      `?fields=product_name,brands,ingredients_text,allergens_tags,labels_tags,url`

    const res = await withTimeout(
      fetch(url, { headers: { 'User-Agent': USER_AGENT } }),
    )
    if (!res.ok) return null

    const json = await res.json()
    if (json.status !== 1 || !json.product) return null

    return normalizeProduct(json.product)
  } catch {
    // Never throw — OFF being down should not block the scan
    return null
  }
}

/**
 * Search by product name (and optional brand) using OFF full-text search.
 * Returns the best matching product that has ingredient data, or null.
 * @param {string|null} name
 * @param {string|null} brand
 * @returns {Promise<NormalizedProduct|null>}
 */
export async function searchByName(name, brand = null) {
  const query = [brand, name].filter(Boolean).join(' ').trim()
  if (!query || query.length < 2) return null

  try {
    const params = new URLSearchParams({
      search_terms: query.slice(0, 100),
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '5',
      fields: 'product_name,brands,ingredients_text,allergens_tags,labels_tags,url',
    })

    const res = await withTimeout(
      fetch(`${OFF_BASE}/cgi/search.pl?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
      }),
    )
    if (!res.ok) return null

    const json = await res.json()
    const products = json.products
    if (!Array.isArray(products) || products.length === 0) return null

    // Prefer products that have ingredient text — more useful for analysis
    const best = products.find(p => p.ingredients_text?.trim()) ?? products[0]
    return normalizeProduct(best)
  } catch {
    return null
  }
}

/**
 * Normalize a raw OFF product object into our internal shape.
 * @param {object} p
 * @returns {NormalizedProduct}
 */
function normalizeProduct(p) {
  const allergenTags = Array.isArray(p.allergens_tags) ? p.allergens_tags : []
  const labelTags    = Array.isArray(p.labels_tags)    ? p.labels_tags    : []

  const hasGluten    = allergenTags.some(t => GLUTEN_FRAGMENTS.some(g => t.includes(g)))
  const isGlutenFree = labelTags.some(t => GF_LABEL_FRAGMENTS.some(f => t.includes(f)))

  // Extract human-readable certification labels (strip language prefix like "en:")
  const certifications = [
    ...labelTags
      .filter(t => GF_LABEL_FRAGMENTS.some(f => t.includes(f)) ||
                   ['organic', 'bio', 'kosher', 'halal', 'vegan', 'fairtrade'].some(k => t.includes(k)))
      .map(t =>
        t.replace(/^[a-z]{2}:/, '')
         .replace(/-/g, ' ')
         .replace(/\b\w/g, c => c.toUpperCase()),
      ),
  ]

  return {
    product_name:    sanitize(p.product_name) || null,
    brand:           sanitize(p.brands?.split(',')[0]?.trim()) || null,
    ingredients_text: sanitize(p.ingredients_text) || null,
    allergen_tags:   allergenTags,
    has_gluten:      hasGluten,
    is_gluten_free:  isGlutenFree,
    certifications:  [...new Set(certifications)].slice(0, 6),
    off_url:         typeof p.url === 'string' && p.url.startsWith('https://') ? p.url : null,
  }
}

/**
 * Strip HTML tags and control characters from OFF text fields to prevent XSS.
 * @param {*} value
 * @returns {string}
 */
function sanitize(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, '')          // strip any HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '')  // strip control chars
    .trim()
}
