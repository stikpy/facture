import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ members: [] })

    const { data } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('user_id, role, users:public.users(id, email, full_name)')
      .eq('organization_id', orgId)

    const members = (data as any[] || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      email: m.users?.email,
      full_name: m.users?.full_name,
    }))

    return NextResponse.json({ members })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { email, role = 'member' } = await request.json()
    if (!email) return NextResponse.json({ error: 'email requis' }, { status: 400 })
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    const { data: target } = await (supabaseAdmin as any)
      .from('public.users')
      .select('id')
      .eq('email', email)
      .single()
    if (!target) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

    await (supabaseAdmin as any)
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: target.id, role } as any)

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
    const userId = searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    await (supabaseAdmin as any)
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


