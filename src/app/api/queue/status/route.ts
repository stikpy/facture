import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID requis' }, { status: 400 })
    }

    // Récupérer le statut de la tâche
    const { data: task, error: taskError } = await (supabaseAdmin
      .from('processing_queue')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as any)

    if (taskError) {
      // Pas de tâche trouvée, vérifier le statut de la facture directement
      const { data: invoice } = await (supabaseAdmin
        .from('invoices')
        .select('status, extracted_data, organization_id')
        .eq('id', invoiceId)
        .single() as any)

      if (invoice) {
        return NextResponse.json({
          status: (invoice as any).status,
          hasTask: false
        })
      }

      // Si la facture n'est pas encore visible (latence d'écriture),
      // renvoyer un statut "pending" plutôt qu'une erreur dure
      return NextResponse.json({ status: 'pending', hasTask: false }, { status: 200 })
    }

    // Si la tâche est en pending depuis plus de 5 secondes, relancer un worker
    if ((task as any).status === 'pending') {
      const created = new Date((task as any).created_at).getTime()
      if (Date.now() - created > 5000) {
        try {
          const origin = request.nextUrl.origin
          await fetch(`${origin}/api/queue/worker`).catch(() => {})
        } catch {}
      }
    }

    // Réconciliation: si la tâche est terminée/échouée mais la facture est toujours "processing",
    // forcer la mise à jour du statut de la facture pour éviter les états bloqués dans l'UI
    if ((task as any).status === 'completed' || (task as any).status === 'failed') {
      try {
        const { data: inv } = await (supabaseAdmin as any)
          .from('invoices')
          .select('status')
          .eq('id', invoiceId)
          .single()
        const current = (inv as any)?.status
        if (current === 'processing') {
          let newStatus = (task as any).status === 'completed' ? 'completed' : 'error'
          const msg = String((task as any).error_message || '')
          if (msg.includes('duplicate_invoice_number')) newStatus = 'duplicate'
          await (supabaseAdmin as any)
            .from('invoices')
            .update({ status: newStatus } as any)
            .eq('id', invoiceId)
        }
      } catch {}
    }

    return NextResponse.json({
      taskId: (task as any).id,
      status: (task as any).status,
      attempts: (task as any).attempts,
      errorMessage: (task as any).error_message,
      createdAt: (task as any).created_at,
      startedAt: (task as any).started_at,
      completedAt: (task as any).completed_at,
      hasTask: true
    })

  } catch (error) {
    console.error('❌ [QUEUE STATUS] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du statut' },
      { status: 500 }
    )
  }
}

