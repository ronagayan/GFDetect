import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[CeliScan] Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(
  supabaseUrl    || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

/* ── Auth helpers ──────────────────────────────────────── */

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

/* ── Scan helpers ──────────────────────────────────────── */

export async function saveScan({ userId, imageBase64, analysis }) {
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

  const { data, error } = await supabase.from('scans').insert({
    user_id:               userId,
    image_url:             imageUrl,
    product_name:          analysis.product_name,
    brand:                 analysis.brand,
    gluten_status:         analysis.gluten_status,
    certainty_percentage:  analysis.certainty_percentage,
    ingredients:           analysis.ingredients           ?? [],
    gluten_sources:        analysis.gluten_sources        ?? [],
    cross_contamination:   analysis.cross_contamination   ?? false,
    cross_contamination_note: analysis.cross_contamination_note ?? null,
    analysis_notes:        analysis.analysis_notes        ?? '',
    is_public:             false,
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

/** Post a scan to the community feed with an optional caption. */
export async function postScanToFeed(scanId, caption = '') {
  const { error } = await supabase
    .from('scans')
    .update({ is_public: true, caption: caption.trim() || null })
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

  if (filter !== 'all') query = query.eq('gluten_status', filter)

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

  if (filter !== 'all') query = query.eq('gluten_status', filter)

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
    total:     data.length,
    safe:      data.filter(s => s.gluten_status === 'safe').length,
    unsafe:    data.filter(s => s.gluten_status === 'unsafe').length,
    uncertain: data.filter(s => s.gluten_status === 'uncertain').length,
  }
}

/* ── Likes ─────────────────────────────────────────────── */

/**
 * Toggle a like on a scan.
 * Returns { liked: boolean } — the NEW state after toggling.
 */
export async function toggleLike(userId, scanId) {
  const { data: existing } = await supabase
    .from('post_likes')
    .select('id')
    .eq('scan_id', scanId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('post_likes').delete().eq('id', existing.id)
    if (error) throw error
    return { liked: false }
  } else {
    const { error } = await supabase.from('post_likes').insert({ scan_id: scanId, user_id: userId })
    if (error) throw error
    return { liked: true }
  }
}

/** Returns a Set of scan IDs liked by the given user. */
export async function fetchUserLikedScanIds(userId) {
  if (!userId) return new Set()
  const { data, error } = await supabase
    .from('post_likes')
    .select('scan_id')
    .eq('user_id', userId)
  if (error) return new Set()
  return new Set((data ?? []).map(r => r.scan_id))
}

/* ── Comments ──────────────────────────────────────────── */

export async function fetchComments(scanId) {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*, profiles(username, avatar_url)')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addComment(userId, scanId, content) {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ scan_id: scanId, user_id: userId, content: content.trim() })
    .select('*, profiles(username, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function deleteComment(commentId) {
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId)
  if (error) throw error
}

/* ── Conversations & Messages ──────────────────────────── */

/**
 * Find an existing DM conversation, or create one.
 * Enforces participant1 < participant2 canonical ordering.
 */
export async function findOrCreateConversation(userId, otherUserId) {
  const [p1, p2] = [userId, otherUserId].sort()

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('participant1', p1)
    .eq('participant2', p2)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await supabase
    .from('conversations')
    .insert({ participant1: p1, participant2: p2 })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch all conversations for a user, enriched with:
 *  - otherProfile: the other participant's profile
 *  - unreadCount:  number of unread message notifications
 */
export async function fetchConversations(userId) {
  const { data: convData, error } = await supabase
    .from('conversations')
    .select('*')
    .or(`participant1.eq.${userId},participant2.eq.${userId}`)
    .order('last_message_at', { ascending: false })
  if (error) throw error

  const convs = convData ?? []
  if (!convs.length) return []

  // Collect other participant IDs
  const otherIds = [...new Set(
    convs.map(c => c.participant1 === userId ? c.participant2 : c.participant1)
  )]

  // Fetch their profiles
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', otherIds)
  const profileMap = Object.fromEntries((profilesData ?? []).map(p => [p.id, p]))

  // Fetch unread message notifications per conversation
  const { data: unreadNotifs } = await supabase
    .from('notifications')
    .select('conversation_id')
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('type', 'message')
    .in('conversation_id', convs.map(c => c.id))

  const unreadMap = {}
  for (const n of (unreadNotifs ?? [])) {
    if (n.conversation_id) {
      unreadMap[n.conversation_id] = (unreadMap[n.conversation_id] ?? 0) + 1
    }
  }

  return convs.map(conv => {
    const otherId = conv.participant1 === userId ? conv.participant2 : conv.participant1
    return {
      ...conv,
      otherProfile: profileMap[otherId] ?? { id: otherId, username: 'Unknown', avatar_url: null },
      unreadCount:  unreadMap[conv.id] ?? 0,
    }
  })
}

/** Fetch messages for a conversation, oldest-first. */
export async function fetchMessages(conversationId, page = 0, limit = 60) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)
  if (error) throw error
  return (data ?? []).reverse()
}

export async function sendMessage(senderId, conversationId, content) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Mark all message notifications for this conversation as read. */
export async function markMessagesRead(conversationId, userId) {
  // Mark messages as read
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false)

  // Mark corresponding notifications as read
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('type', 'message')
    .eq('conversation_id', conversationId)
    .eq('is_read', false)
}

/** Returns total unread message notification count for a user. */
export async function fetchUnreadCount(userId) {
  if (!userId) return 0
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('type', 'message')
  return count ?? 0
}
