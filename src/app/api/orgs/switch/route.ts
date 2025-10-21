import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const orgId = String(body?.organization_id || '')
    if (!orgId) return NextResponse.json({ error: 'organization_id requis' }, { status: 400 })

    // Vérifier membership
    const { data: membership } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })

    await (supabaseAdmin as any).auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user as any).user_metadata, organization_id: orgId }
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


