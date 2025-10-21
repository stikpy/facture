import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data: memberships } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('organization_id, role, organizations!inner(id, name)')
      .eq('user_id', user.id)

    const orgs = (memberships as any[] || []).map((m) => ({
      id: m.organization_id,
      name: (m.organizations as any)?.name,
      role: m.role,
    }))

    const activeOrgId = (user as any)?.user_metadata?.organization_id || null

    return NextResponse.json({ organizations: orgs, activeOrganizationId: activeOrgId })
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
    const name = String(body?.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

    const { data: org, error: orgErr } = await (supabaseAdmin as any)
      .from('organizations')
      .insert({ name, created_by: user.id } as any)
      .select()
      .single()
    if (orgErr) throw orgErr

    await (supabaseAdmin as any)
      .from('organization_members')
      .insert({ organization_id: org.id, user_id: user.id, role: 'owner' } as any)

    // définir l'orga active dans le metadata
    await (supabaseAdmin as any).auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user as any).user_metadata, organization_id: org.id }
    })

    return NextResponse.json({ success: true, organization: org })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


