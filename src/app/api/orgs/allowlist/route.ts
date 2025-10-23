import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ entries: [] })

    const { data } = await (supabaseAdmin as any)
      .from('organization_sender_allowlist')
      .select('id, sender_email, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    return NextResponse.json({ entries: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const email = String(body?.sender_email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    const { error: insErr } = await (supabaseAdmin as any)
      .from('organization_sender_allowlist')
      .insert({ organization_id: orgId, sender_email: email } as any)
    if (insErr && !String(insErr.message||'').includes('duplicate')) throw insErr

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

    // Optionnel: vérifier que l'entrée appartient à l'orga active
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    await (supabaseAdmin as any)
      .from('organization_sender_allowlist')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


