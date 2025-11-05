import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const body = await request.json()
    const code = String(body?.code || '').trim().toUpperCase()
    if (!code) return NextResponse.json({ error: 'Code requis' }, { status: 400 })

    const { data: invite, error: invErr } = await (supabaseAdmin as any)
      .from('organization_invites')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .limit(1)
      .single()
    if (invErr || !invite) return NextResponse.json({ error: 'Invitation introuvable ou inactive' }, { status: 404 })
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invitation expirée' }, { status: 400 })
    if (invite.max_uses && invite.used_count >= invite.max_uses) return NextResponse.json({ error: 'Invitation épuisée' }, { status: 400 })

    // Ajouter l'utilisateur comme membre si pas déjà
    const { data: existing } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', user.id)
      .limit(1)
    if (!existing || existing.length === 0) {
      await (supabaseAdmin as any)
        .from('organization_members')
        .insert({ organization_id: invite.organization_id, user_id: user.id, role: 'member' } as any)
    }

    // Incrémenter compteur
    const newCount = (invite.used_count || 0) + 1
    await (supabaseAdmin as any)
      .from('organization_invites')
      .update({ used_count: newCount, is_active: invite.max_uses ? newCount < invite.max_uses : true } as any)
      .eq('id', invite.id)

    // Définir org active dans metadata
    await (supabaseAdmin as any).auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user as any).user_metadata, organization_id: invite.organization_id }
    })

    return NextResponse.json({ success: true, organization_id: invite.organization_id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


