import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // trouver org active
    let orgId: string | null = (user as any)?.user_metadata?.organization_id || null
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
      orgId = (m as any)?.organization_id || null
    }
    if (!orgId) return NextResponse.json({ invites: [] })

    const { data, error: qErr } = await (supabaseAdmin as any)
      .from('organization_invites')
      .select('id, code, created_at, expires_at, max_uses, used_count, is_active')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
    if (qErr) throw qErr
    return NextResponse.json({ invites: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const { expires_at, max_uses } = body || {}

    // org active
    let orgId: string | null = (user as any)?.user_metadata?.organization_id || null
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
      orgId = (m as any)?.organization_id || null
    }
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    // code simple alphanum
    const code = Math.random().toString(36).slice(2, 10).toUpperCase()
    const { data, error: insErr } = await (supabaseAdmin as any)
      .from('organization_invites')
      .insert({ organization_id: orgId, created_by: user.id, code, expires_at, max_uses: max_uses ?? 1 } as any)
      .select('*').single()
    if (insErr) throw insErr
    return NextResponse.json({ invite: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


