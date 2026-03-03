import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[CeliScan] Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

/* ── Helpers ──────────────────────────────────── */

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

export async function saveScan({ userId, imageBase64, analysis }) {
  // 1. Upload image to storage
  let imageUrl = null
  if (userId && imageBase64) {
    const filename = `${userId}/${Date.now()}.jpg`
    const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))
    const { data: upload, error: uploadErr } = await supabase.storage
      .from('scan-images')
      .upload(filename, bytes, { contentType: 'image/jpeg', upsert: false })
    if (!uploadErr && upload) {
      const { data: urlData } = supabase.storage
        .from('scan-images')
        .getPublicUrl(filename)
      imageUrl = urlData?.publicUrl ?? null
    }
  }

  // 2. Insert scan record
  const { data, error } = await supabase.from('scans').insert({
    user_id: userId,
    image_url: imageUrl,
    product_name: analysis.product_name,
    brand: analysis.brand,
    gluten_status: analysis.gluten_status,
    certainty_percentage: analysis.certainty_percentage,
    ingredients: analysis.ingredients ?? [],
    gluten_sources: analysis.gluten_sources ?? [],
    cross_contamination: analysis.cross_contamination ?? false,
    cross_contamination_note: analysis.cross_contamination_note ?? null,
    analysis_notes: analysis.analysis_notes ?? '',
    is_public: false,
  }).select().single()

  if (error) throw error
  return data
}

export async function makeScanPublic(scanId) {
  const { error } = await supabase
    .from('scans')
    .update({ is_public: true })
    .eq('id', scanId)
  if (error) throw error
}

export async function fetchPublicScans(filter = 'all', page = 0, limit = 20) {
  let query = supabase
    .from('scans')
    .select('*, profiles(username)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)

  if (filter !== 'all') {
    query = query.eq('gluten_status', filter)
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchUserScans(userId, filter = 'all', page = 0, limit = 20) {
  let query = supabase
    .from('scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)

  if (filter !== 'all') {
    query = query.eq('gluten_status', filter)
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getUserScanStats(userId) {
  const { data, error } = await supabase
    .from('scans')
    .select('gluten_status')
    .eq('user_id', userId)
  if (error) return { total: 0, safe: 0, unsafe: 0, uncertain: 0 }
  return {
    total: data.length,
    safe: data.filter(s => s.gluten_status === 'safe').length,
    unsafe: data.filter(s => s.gluten_status === 'unsafe').length,
    uncertain: data.filter(s => s.gluten_status === 'uncertain').length,
  }
}
