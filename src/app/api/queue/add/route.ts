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

    // Vérifier que la facture existe et appartient à l'utilisateur
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, user_id')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // Vérifier si une tâche existe déjà pour cette facture
    const { data: existingTask } = await supabaseAdmin
      .from('processing_queue')
      .select('id, status')
      .eq('invoice_id', invoiceId)
      .in('status', ['pending', 'processing'])
      .single()

    if (existingTask) {
      console.log('⚠️ [QUEUE] Tâche déjà en queue:', existingTask.id)
      return NextResponse.json({
        success: true,
        taskId: existingTask.id,
        message: 'Tâche déjà en queue'
      })
    }

    // Ajouter la tâche à la queue
    const { data: task, error: queueError } = await supabaseAdmin
      .from('processing_queue')
      .insert({
        invoice_id: invoiceId,
        user_id: user.id,
        priority,
        status: 'pending'
      })
      .select()
      .single()

    if (queueError) {
      console.error('❌ [QUEUE] Erreur ajout tâche:', queueError)
      throw queueError
    }

    console.log('✅ [QUEUE] Tâche ajoutée:', task.id)

    return NextResponse.json({
      success: true,
      taskId: task.id
    })

  } catch (error) {
    console.error('❌ [QUEUE] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout à la queue' },
      { status: 500 }
    )
  }
}

