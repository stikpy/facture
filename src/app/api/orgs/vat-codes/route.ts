import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    let orgId: string | null = searchParams.get('organization_id')
    if (!orgId) {
      orgId = (user as any)?.user_metadata?.organization_id || null
    }
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      orgId = (m as any)?.organization_id || null
    }
    if (!orgId) return NextResponse.json({ vatCodes: [] })

    const { data } = await (supabaseAdmin as any)
      .from('organization_vat_codes')
      .select('id, code, label, rate, synonyms')
      .eq('organization_id', orgId)
      .order('code')
    return NextResponse.json({ vatCodes: data || [] })
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
    const rate = Number(body?.rate)
    const synonyms = Array.isArray(body?.synonyms)
      ? body.synonyms.map((s: any) => String(s))
      : String(body?.synonyms || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    if (!code || !label || Number.isNaN(rate)) return NextResponse.json({ error: 'Code, libellé et taux requis' }, { status: 400 })

    let orgId: string = String(body?.organization_id || '') || (user as any)?.user_metadata?.organization_id
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      orgId = (m as any)?.organization_id
    }
    if (!orgId) return NextResponse.json({ error: 'Organisation active manquante' }, { status: 400 })

    const { data, error: upErr } = await (supabaseAdmin as any)
      .from('organization_vat_codes')
      .upsert({ organization_id: orgId, code, label, rate, synonyms } as any, { onConflict: 'organization_id,code' })
      .select()
      .single()
    if (upErr) throw upErr
    return NextResponse.json({ success: true, vatCode: data })
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

    let orgId: string | null = (user as any)?.user_metadata?.organization_id || null
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      orgId = (m as any)?.organization_id || null
    }
    if (!orgId) return NextResponse.json({ error: 'Organisation active manquante' }, { status: 400 })

    const { error: delErr } = await (supabaseAdmin as any)
      .from('organization_vat_codes')
      .delete()
      .eq('organization_id', orgId)
      .eq('code', code)
    if (delErr) throw delErr
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


