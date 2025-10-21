import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeSupplier } from '@/lib/suppliers'

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
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // Vérifier appartenance à l'organisation
    if ((invoice as any).organization_id) {
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
      const orgIds = ((memberships as any[]) || []).map(m => m.organization_id)
      if (!orgIds.includes((invoice as any).organization_id)) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })
      }
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
    const { supplier_name, supplier_id, description, allocations,
      client_name, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount } = body || {}

    // 1) Charger la facture
    const { data: invoice, error: invErr } = await (supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single() as any)

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // 2) Vérifier appartenance à l'organisation
    if ((invoice as any).organization_id) {
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
      const orgIds = ((memberships as any[]) || []).map(m => m.organization_id)
      if (!orgIds.includes((invoice as any).organization_id)) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })
      }
    }

    // 3) Mettre à jour quelques champs dans extracted_data (JSON)
    const extracted = (invoice as any)?.extracted_data || {}
    const updatedExtracted = {
      ...extracted,
      ...(supplier_name ? { supplier_name } : {}),
      ...(description ? { description } : {}),
      ...(client_name !== undefined ? { client_name } : {}),
      ...(invoice_number !== undefined ? { invoice_number } : {}),
      ...(invoice_date !== undefined ? { invoice_date } : {}),
      ...(due_date !== undefined ? { due_date } : {}),
      ...(subtotal !== undefined ? { subtotal } : {}),
      ...(tax_amount !== undefined ? { tax_amount } : {}),
      ...(total_amount !== undefined ? { total_amount } : {}),
    }

    const updatePayload: any = { extracted_data: updatedExtracted }
    if (supplier_id) updatePayload.supplier_id = supplier_id
    const { error: upErr } = await ((supabaseAdmin as any)
      .from('invoices')
      .update(updatePayload as any)
      .eq('id', invoiceId))

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    // 4) Si on a choisi un supplier_id et un supplier_name brut, enregistrer l'alias pour les prochaines reconnaissances
    try {
      if (supplier_id && supplier_name) {
        const aliasKey = normalizeSupplier(String(supplier_name))
        if (aliasKey) {
          await (supabaseAdmin as any)
            .from('supplier_aliases')
            .insert({ supplier_id, alias_key: aliasKey } as any)
            .onConflict('supplier_id,alias_key')
            .ignore?.()
        }
      }
    } catch {}

    // 5) Réécrire la ventilation
    if (Array.isArray(allocations)) {
      try {
        const { error: delErr } = await supabaseAdmin
          .from('invoice_allocations')
          .delete()
          .eq('invoice_id', invoiceId)
        if (delErr) throw delErr

        if (allocations.length > 0) {
          const rows = allocations.map((a: any) => ({
            invoice_id: invoiceId,
            user_id: user.id,
            account_code: String(a.account_code || ''),
            label: a.label ? String(a.label) : null,
            amount: Number(a.amount || 0),
          }))
          const { error: insErr } = await ((supabaseAdmin as any)
            .from('invoice_allocations')
            .insert(rows as any))
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


