import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // Récupérer l'organisation active depuis le metadata utilisateur
    const activeOrgId = (user as any)?.user_metadata?.organization_id
    if (!activeOrgId) return NextResponse.json({ accounts: [] })

    const { data, error: qErr } = await (supabaseAdmin as any)
      .from('organization_accounts')
      .select('id, code, label, synonyms')
      .eq('organization_id', activeOrgId)
      .order('code')
    if (qErr) throw qErr
    return NextResponse.json({ accounts: data || [] })
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
    const code = String(body?.code || '').trim()
    const label = String(body?.label || '').trim()
    const synonyms = Array.isArray(body?.synonyms) ? body.synonyms.map((s: any) => String(s)) : []
    if (!code || !label) return NextResponse.json({ error: 'Code et libellé requis' }, { status: 400 })

    const activeOrgId = (user as any)?.user_metadata?.organization_id
    if (!activeOrgId) return NextResponse.json({ error: 'Organisation active manquante' }, { status: 400 })

    const { data, error: upErr } = await (supabaseAdmin as any)
      .from('organization_accounts')
      .upsert({ organization_id: activeOrgId, code, label, synonyms } as any, { onConflict: 'organization_id,code' })
      .select()
      .single()
    if (upErr) throw upErr
    return NextResponse.json({ success: true, account: data })
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
    const code = searchParams.get('code')
    if (!code) return NextResponse.json({ error: 'Code requis' }, { status: 400 })
    const activeOrgId = (user as any)?.user_metadata?.organization_id
    if (!activeOrgId) return NextResponse.json({ error: 'Organisation active manquante' }, { status: 400 })

    const { error: delErr } = await (supabaseAdmin as any)
      .from('organization_accounts')
      .delete()
      .eq('organization_id', activeOrgId)
      .eq('code', code)
    if (delErr) throw delErr
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


