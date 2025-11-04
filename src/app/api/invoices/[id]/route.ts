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

    // Charger le fournisseur avec son statut de validation
    let supplier = null
    if ((invoice as any).supplier_id) {
      const { data: supplierData } = await supabaseAdmin
        .from('suppliers')
        .select('id, code, display_name, validation_status, is_active')
        .eq('id', (invoice as any).supplier_id)
        .single()
      supplier = supplierData
    }

    let pairedDocument = null
    if ((invoice as any).paired_document_id) {
      const { data: pair } = await supabaseAdmin
        .from('invoices')
        .select('id, file_name, document_type, document_reference, extracted_data, created_at')
        .eq('id', (invoice as any).paired_document_id)
        .single()
      pairedDocument = pair
    }

    return NextResponse.json({
      invoice: { ...(invoice as any), supplier, paired_document: pairedDocument },
      allocations
    })
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
      client_name, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, manual_mode } = body || {}
    
    console.log('🔍 [API] === DÉBUT PUT /api/invoices/' + invoiceId + ' ===')
    console.log('🔍 [API] Body reçu:', JSON.stringify(body, null, 2))
    console.log('🔍 [API] Allocations extraites:', allocations)
    console.log('🔍 [API] Nombre d\'allocations reçues:', allocations?.length || 0)

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
      ...(manual_mode === true ? { ocr_mode: 'manual' } : {}),
    }

    const updatePayload: any = { extracted_data: updatedExtracted }
    if (supplier_id) updatePayload.supplier_id = supplier_id
    if (manual_mode === true) updatePayload.status = 'awaiting_user'
    const { error: upErr } = await ((supabaseAdmin as any)
      .from('invoices')
      .update(updatePayload as any)
      .eq('id', invoiceId))

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    // Si on bascule en mode manuel, supprimer les tâches de queue en attente pour éviter un retraitement
    if (manual_mode === true) {
      try {
        await (supabaseAdmin as any)
          .from('processing_queue')
          .delete()
          .eq('invoice_id', invoiceId)
          .in('status', ['pending', 'processing'])
      } catch {}
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
    console.log('🔍 [API] Allocations reçues:', allocations)
    console.log('🔍 [API] Invoice ID:', invoiceId)
    console.log('🔍 [API] User ID:', user.id)
    if (Array.isArray(allocations)) {
      try {
        console.log('🔍 [API] Suppression des anciennes allocations...')
        const { data: delData, error: delErr } = await supabaseAdmin
          .from('invoice_allocations')
          .delete()
          .eq('invoice_id', invoiceId)
          .eq('user_id', user.id)
          .select()
        if (delErr) {
          console.error('❌ [API] Erreur suppression:', delErr)
          throw delErr
        }
        console.log('✅ [API] Anciennes allocations supprimées:', delData?.length || 0, 'lignes')
        console.log('🔍 [API] Détail des allocations supprimées:', delData)

        if (allocations.length > 0) {
          const rows = allocations.map((a: any) => ({
            invoice_id: invoiceId,
            user_id: user.id,
            account_code: String(a.account_code || ''),
            label: a.label ? String(a.label) : null,
            amount: Number(a.amount || 0),
            vat_code: a.vat_code ? String(a.vat_code) : null,
            vat_rate: a.vat_rate != null ? Number(a.vat_rate) : null,
          }))
          console.log('🔍 [API] Nouvelles allocations à insérer:', rows)
          
          const { data: insData, error: insErr } = await ((supabaseAdmin as any)
            .from('invoice_allocations')
            .insert(rows as any)
            .select())
          if (insErr) {
            console.error('❌ [API] Erreur insertion:', insErr)
            throw insErr
          }
          console.log('✅ [API] Allocations insérées avec succès:', insData?.length || 0, 'lignes')
          console.log('🔍 [API] Détail des allocations insérées:', insData)
        } else {
          console.log('⚠️ [API] Aucune allocation à insérer')
        }
      } catch (e: any) {
        console.error('❌ [API] Erreur ventilations:', e)
        if (!String(e?.message || '').includes('invoice_allocations')) {
          return NextResponse.json({ error: e.message || 'Erreur inconnue' }, { status: 500 })
        }
        // Si la table n'existe pas, on enregistre quand même la mise à jour des métadonnées
        console.log('⚠️ [API] Table invoice_allocations n\'existe pas, ignoré')
      }
    } else {
      console.log('⚠️ [API] Allocations n\'est pas un tableau:', typeof allocations)
    }

    console.log('✅ [API] === FIN PUT /api/invoices/' + invoiceId + ' - SUCCÈS ===')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}


export async function DELETE(
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

    // Charger la facture et vérifier l'appartenance (orga)
    const { data: invoice, error: invErr } = await (supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single() as any)

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

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

    // Supprimer les allocations liées à l'utilisateur
    try {
      await (supabaseAdmin as any)
        .from('invoice_allocations')
        .delete()
        .eq('invoice_id', invoiceId)
        .eq('user_id', user.id)
    } catch {}

    // Supprimer les tâches de queue
    try {
      await (supabaseAdmin as any)
        .from('processing_queue')
        .delete()
        .eq('invoice_id', invoiceId)
        .eq('user_id', user.id)
    } catch {}

    // Supprimer le fichier de storage si présent
    try {
      const filePath = (invoice as any).file_path
      if (filePath) {
        const { storage: adminStorage } = supabaseAdmin as any
        await adminStorage.from('invoices').remove([filePath])
      }
    } catch {}

    // Supprimer la facture
    const { error: delErr } = await (supabaseAdmin as any)
      .from('invoices')
      .delete()
      .eq('id', invoiceId)

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

