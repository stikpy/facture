import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { full_address } = await request.json()
    const addr = String(full_address || '').trim().toLowerCase()
    if (!addr.includes('@')) return NextResponse.json({ error: 'Adresse invalide' }, { status: 400 })

    let orgId = (user as any)?.user_metadata?.organization_id as string | null
    if (!orgId) {
      // Fallback: prendre la première organisation où l'utilisateur est membre
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      orgId = (memberships?.[0]?.organization_id as string) || null
    }
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active (définissez-en une ou activez-en une)' }, { status: 400 })

    const { error: upErr } = await (supabaseAdmin as any)
      .from('inbound_addresses')
      .upsert({ full_address: addr, organization_id: orgId } as any)
    if (upErr) throw upErr

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    let orgId = (user as any)?.user_metadata?.organization_id as string | null
    if (!orgId) {
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      orgId = (memberships?.[0]?.organization_id as string) || null
    }
    if (!orgId) return NextResponse.json({ entries: [] })

    const { data } = await (supabaseAdmin as any)
      .from('inbound_addresses')
      .select('full_address, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    return NextResponse.json({ entries: data || [] })
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
    const addr = String(searchParams.get('full_address') || '').toLowerCase()
    if (!addr) return NextResponse.json({ error: 'Adresse requise' }, { status: 400 })

    let orgId = (user as any)?.user_metadata?.organization_id as string | null
    if (!orgId) {
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      orgId = (memberships?.[0]?.organization_id as string) || null
    }
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    const { error: delErr } = await (supabaseAdmin as any)
      .from('inbound_addresses')
      .delete()
      .eq('full_address', addr)
      .eq('organization_id', orgId)
    if (delErr) throw delErr

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


