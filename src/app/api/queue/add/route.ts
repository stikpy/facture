import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  console.log('🎯 [QUEUE] Ajout d\'une tâche à la queue')
  
  try {
    const supabase = await createClient()
    
    // Vérifier l'authentification
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

    const { invoiceId, priority = 0 } = await request.json()

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID requis' }, { status: 400 })
    }

    // Vérifier que la facture existe et appartient à l'organisation de l'utilisateur
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, user_id, organization_id, status, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // Optionnel: vérifier l'appartenance à l'orga via membership
    const { data: memberships } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
    const orgIds = ((memberships as any[]) || []).map(m => m.organization_id)
    if ((invoice as any).organization_id && orgIds.length > 0 && !orgIds.includes((invoice as any).organization_id)) {
      return NextResponse.json({ error: 'Accès interdit à cette facture' }, { status: 403 })
    }

    // Si doublon détecté précédemment et toujours en conflit, empêcher la relance
    try {
      const invNum = (invoice as any)?.extracted_data?.invoice_number
      const orgId = (invoice as any)?.organization_id
      const supplierId = (invoice as any)?.supplier_id
      if (invNum && orgId && supplierId) {
        const { data: dup } = await (supabaseAdmin as any)
          .from('invoices')
          .select('id')
          .eq('organization_id', orgId)
          .eq('supplier_id', supplierId)
          .neq('id', invoiceId)
          .filter('extracted_data->>invoice_number', 'eq', String(invNum))
        if (Array.isArray(dup) && dup.length > 0) {
          try {
            await (supabaseAdmin as any)
              .from('invoices')
              .update({ status: 'awaiting_user' } as any)
              .eq('id', invoiceId)
          } catch {}
          return NextResponse.json({
            error: 'duplicate_pending_user_action',
            message: 'Un document avec le même numéro existe déjà. Corrigez le N° avant de relancer.'
          }, { status: 409 })
        }
      }
    } catch {}

    // Vérifier si une tâche existe déjà pour cette facture
    const { data: existingTask } = await supabaseAdmin
      .from('processing_queue')
      .select('id, status')
      .eq('invoice_id', invoiceId)
      .in('status', ['pending', 'processing'])
      .single()

    if (existingTask) {
      console.log('⚠️ [QUEUE] Tâche déjà en queue:', (existingTask as any).id)
      // Fire-and-forget: tenter de démarrer un worker immédiatement
      try {
        const origin = request.nextUrl.origin
        await fetch(`${origin}/api/queue/worker`).catch(() => {})
      } catch {}
      return NextResponse.json({
        success: true,
        taskId: (existingTask as any).id,
        message: 'Tâche déjà en queue'
      })
    }

    // Mettre la facture en pending (feedback immédiat UI)
    try {
      await (supabaseAdmin as any)
        .from('invoices')
        .update({ status: 'queued' } as any)
        .eq('id', invoiceId)
    } catch {}

    // Ajouter la tâche à la queue
    const { data: task, error: queueError } = await ((supabaseAdmin as any)
      .from('processing_queue')
      .insert({
        invoice_id: invoiceId,
        user_id: user.id,
        priority,
        status: 'pending'
      } as any)
      .select()
      .single())

    if (queueError) {
      console.error('❌ [QUEUE] Erreur ajout tâche:', queueError)
      throw queueError
    }

    console.log('✅ [QUEUE] Tâche ajoutée:', (task as any).id)

    // Fire-and-forget: démarrer le worker tout de suite (Hobby: pas de cron fréquent)
    try {
      const origin = request.nextUrl.origin
      await fetch(`${origin}/api/queue/worker`).catch(() => {})
    } catch {}

    return NextResponse.json({
      success: true,
      taskId: (task as any).id
    })

  } catch (error) {
    console.error('❌ [QUEUE] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout à la queue' },
      { status: 500 }
    )
  }
}

