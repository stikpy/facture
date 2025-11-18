import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Duplique une facture avec sélection d'articles
 * POST /api/invoices/duplicate
 * Body: { source_invoice_id: string, selected_item_indices: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (!user) {
      const authHeader = request.headers.get('authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const authResult = await supabase.auth.getUser(token)
        user = authResult.data.user
        authError = authResult.error
      }
    }
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const { source_invoice_id, selected_item_indices } = body

    if (!source_invoice_id) {
      return NextResponse.json({ error: 'source_invoice_id requis' }, { status: 400 })
    }

    if (!Array.isArray(selected_item_indices) || selected_item_indices.length === 0) {
      return NextResponse.json({ error: 'Au moins un article doit être sélectionné' }, { status: 400 })
    }

    // Récupérer la facture source
    const { data: sourceInvoice, error: sourceError } = await (supabaseAdmin as any)
      .from('invoices')
      .select('*')
      .eq('id', source_invoice_id)
      .single()

    if (sourceError || !sourceInvoice) {
      return NextResponse.json({ error: 'Facture source introuvable' }, { status: 404 })
    }

    // Vérifier que l'utilisateur a accès à cette facture
    if ((sourceInvoice as any).organization_id) {
      const { data: memberships } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
      const orgIds = ((memberships as any[]) || []).map(m => m.organization_id)
      if (!orgIds.includes((sourceInvoice as any).organization_id)) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })
      }
    }

    // Récupérer les articles de la facture source
    const extractedData = (sourceInvoice as any).extracted_data || {}
    const sourceItems = Array.isArray(extractedData.items) ? extractedData.items : []

    if (sourceItems.length === 0) {
      return NextResponse.json({ error: 'La facture source ne contient pas d\'articles' }, { status: 400 })
    }

    // Filtrer les articles sélectionnés
    const selectedItems = selected_item_indices
      .filter((idx: number) => idx >= 0 && idx < sourceItems.length)
      .map((idx: number) => sourceItems[idx])

    if (selectedItems.length === 0) {
      return NextResponse.json({ error: 'Aucun article valide sélectionné' }, { status: 400 })
    }

    // Calculer les nouveaux montants basés sur les articles sélectionnés
    let newSubtotal = 0
    let newTaxAmount = 0
    let newTotalAmount = 0

    for (const item of selectedItems) {
      const itemTotal = Number(item.total_price || 0)
      const itemTaxRate = Number(item.tax_rate || 0) / 100
      const itemHT = itemTotal / (1 + itemTaxRate)
      const itemTVA = itemTotal - itemHT

      newSubtotal += itemHT
      newTaxAmount += itemTVA
      newTotalAmount += itemTotal
    }

    // Créer les nouvelles données extraites avec seulement les articles sélectionnés
    const newExtractedData = {
      ...extractedData,
      items: selectedItems,
      subtotal: Number(newSubtotal.toFixed(2)),
      tax_amount: Number(newTaxAmount.toFixed(2)),
      total_amount: Number(newTotalAmount.toFixed(2)),
      invoice_number: extractedData.invoice_number 
        ? `${extractedData.invoice_number}-PART` 
        : undefined,
      document_reference: extractedData.document_reference
        ? `${extractedData.document_reference}-PART`
        : undefined,
      notes: `Facture partielle créée à partir de ${sourceInvoice.file_name || 'facture source'}. Articles sélectionnés: ${selectedItems.length}/${sourceItems.length}`,
    }

    // Créer la nouvelle facture (sans fichier PDF, juste les données)
    const { data: newInvoice, error: createError } = await (supabaseAdmin as any)
      .from('invoices')
      .insert({
        user_id: user.id,
        organization_id: (sourceInvoice as any).organization_id,
        supplier_id: (sourceInvoice as any).supplier_id,
        file_name: `DUPLICATE-${sourceInvoice.file_name || 'facture'}`,
        file_path: null, // Pas de fichier PDF pour la duplication
        file_size: 0,
        mime_type: 'application/json',
        status: 'completed',
        extracted_data: newExtractedData,
        classification: (sourceInvoice as any).classification,
        document_type: (sourceInvoice as any).document_type || 'invoice',
        document_reference: newExtractedData.document_reference,
      } as any)
      .select('*')
      .single()

    if (createError) {
      console.error('Erreur création facture dupliquée:', createError)
      return NextResponse.json({ error: 'Erreur lors de la création de la facture dupliquée' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
      summary: {
        source_items_count: sourceItems.length,
        selected_items_count: selectedItems.length,
        new_subtotal: newExtractedData.subtotal,
        new_tax_amount: newExtractedData.tax_amount,
        new_total_amount: newExtractedData.total_amount,
      }
    })

  } catch (error: any) {
    console.error('Erreur API duplicate:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

