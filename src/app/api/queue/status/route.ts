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
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as any)

    if (taskError) {
      // Pas de tâche trouvée, vérifier le statut de la facture directement
      const { data: invoice } = await (supabaseAdmin
        .from('invoices')
        .select('status, extracted_data')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single() as any)

      if (invoice) {
        return NextResponse.json({
          status: (invoice as any).status,
          hasTask: false
        })
      }

      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
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

