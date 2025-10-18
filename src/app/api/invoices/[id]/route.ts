import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await supabase.auth.getSession()
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      const authHeader = _request.headers.get('authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const authRes = await supabase.auth.getUser(token)
        user = authRes.data.user
        authError = authRes.error
      }
    }
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { id: invoiceId } = await context.params

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    let allocations: any[] = []
    try {
      const { data: allocData, error: allocErr } = await supabaseAdmin
        .from('invoice_allocations')
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (allocErr) throw allocErr
      allocations = allocData || []
    } catch (e: any) {
      // Tolérance si la table n'existe pas encore
      if (!String(e?.message || '').includes('invoice_allocations')) {
        return NextResponse.json({ error: e.message || 'Erreur inconnue' }, { status: 500 })
      }
    }

    return NextResponse.json({ invoice, allocations })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await supabase.auth.getSession()
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      const authHeader = request.headers.get('authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const authRes = await supabase.auth.getUser(token)
        user = authRes.data.user
        authError = authRes.error
      }
    }
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { id: invoiceId } = await context.params
    const body = await request.json()
    const { supplier_name, description, allocations } = body || {}

    // 1) Charger la facture
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // 2) Mettre à jour quelques champs dans extracted_data (JSON)
    const extracted = invoice.extracted_data || {}
    const updatedExtracted = {
      ...extracted,
      ...(supplier_name ? { supplier_name } : {}),
      ...(description ? { description } : {}),
    }

    const { error: upErr } = await supabaseAdmin
      .from('invoices')
      .update({ extracted_data: updatedExtracted })
      .eq('id', invoiceId)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    // 3) Réécrire la ventilation
    if (Array.isArray(allocations)) {
      try {
        const { error: delErr } = await supabaseAdmin
          .from('invoice_allocations')
          .delete()
          .eq('invoice_id', invoiceId)
          .eq('user_id', user.id)
        if (delErr) throw delErr

        if (allocations.length > 0) {
          const rows = allocations.map((a: any) => ({
            invoice_id: invoiceId,
            user_id: user.id,
            account_code: String(a.account_code || ''),
            label: a.label ? String(a.label) : null,
            amount: Number(a.amount || 0),
          }))
          const { error: insErr } = await supabaseAdmin
            .from('invoice_allocations')
            .insert(rows)
          if (insErr) throw insErr
        }
      } catch (e: any) {
        if (!String(e?.message || '').includes('invoice_allocations')) {
          return NextResponse.json({ error: e.message || 'Erreur inconnue' }, { status: 500 })
        }
        // Si la table n'existe pas, on enregistre quand même la mise à jour des métadonnées
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}


