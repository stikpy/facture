import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'

export const maxDuration = 300 // 5 minutes max pour Vercel

export async function GET(request: NextRequest) {
  console.log('🔄 [WORKER] Démarrage du worker')
  
  try {
    // Récupérer la prochaine tâche à traiter
    const { data: task, error: taskError } = await (supabaseAdmin
      .from('processing_queue')
      .select('*, invoices(*)')
      .eq('status', 'pending')
      .lt('attempts', 3) // Max 3 tentatives
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single() as any)

    if (taskError || !task) {
      console.log('ℹ️ [WORKER] Aucune tâche en attente')
      return NextResponse.json({ message: 'Aucune tâche en attente' })
    }

    console.log(`🎯 [WORKER] Traitement de la tâche ${(task as any).id} pour la facture ${(task as any).invoice_id}`)

    // Marquer la tâche comme en cours
    await (supabaseAdmin as any)
      .from('processing_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: (task as any).attempts + 1
      } as any)
      .eq('id', (task as any).id)

    // Mettre à jour le statut de la facture
    await (supabaseAdmin as any)
      .from('invoices')
      .update({ status: 'processing' } as any)
      .eq('id', (task as any).invoice_id)

    try {
      const invoice = (task as any).invoices

      // Télécharger le fichier
      console.log(`📥 [WORKER] Téléchargement du fichier: ${(invoice as any).file_path}`)
      const storageService = new StorageService()
      const fileBuffer = await storageService.downloadFile((invoice as any).file_path)

      let extractedText = ''

      // Extraction de texte selon le type
      if ((invoice as any).mime_type === 'application/pdf') {
        console.log('📄 [WORKER] Traitement PDF avec OCR')
        const ocrProcessor = new OCRProcessor()
        const texts = await ocrProcessor.processPDF(fileBuffer)
        extractedText = texts.join('\n')
        await ocrProcessor.terminate()
      } else if ((invoice as any).mime_type.startsWith('image/')) {
        console.log('🖼️ [WORKER] Traitement image avec OCR')
        const ocrProcessor = new OCRProcessor()
        extractedText = await ocrProcessor.processImage(fileBuffer)
        await ocrProcessor.terminate()
      }

      if (!extractedText.trim()) {
        throw new Error('Aucun texte extrait du document')
      }

      // Traitement IA
      console.log('🤖 [WORKER] Traitement IA')
      const documentProcessor = new DocumentProcessor()
      const extractedData = await documentProcessor.processDocument(extractedText, (invoice as any).file_name)
      const classification = await documentProcessor.classifyInvoice(extractedData)

      // Sauvegarder les résultats
      console.log('💾 [WORKER] Sauvegarde des résultats')
      await (supabaseAdmin as any)
        .from('invoices')
        .update({
          extracted_data: extractedData,
          classification: classification.category,
          status: 'completed'
        } as any)
        .eq('id', (task as any).invoice_id)

      // Créer les articles de facture
      if (extractedData.items && extractedData.items.length > 0) {
        const items = extractedData.items.map((item: any) => ({
          invoice_id: (task as any).invoice_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))

        await (supabaseAdmin as any)
          .from('invoice_items')
          .insert(items as any)
      }

      // Marquer la tâche comme complétée
      await (supabaseAdmin as any)
        .from('processing_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        } as any)
        .eq('id', (task as any).id)

      console.log('✅ [WORKER] Tâche complétée avec succès')

      return NextResponse.json({
        success: true,
        taskId: (task as any).id,
        invoiceId: (task as any).invoice_id
      })

    } catch (processingError) {
      console.error('❌ [WORKER] Erreur traitement:', processingError)

      // Marquer comme échoué si max tentatives atteintes
      const newStatus = (task as any).attempts + 1 >= 3 ? 'failed' : 'pending'

      await (supabaseAdmin as any)
        .from('processing_queue')
        .update({
          status: newStatus,
          error_message: (processingError as Error).message
        } as any)
        .eq('id', (task as any).id)

      await (supabaseAdmin as any)
        .from('invoices')
        .update({
          status: 'error',
          extracted_data: { error: (processingError as Error).message }
        } as any)
        .eq('id', (task as any).invoice_id)

      return NextResponse.json(
        {
          error: 'Erreur lors du traitement',
          message: (processingError as Error).message
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('❌ [WORKER] Erreur globale:', error)
    return NextResponse.json(
      { error: 'Erreur interne du worker' },
      { status: 500 }
    )
  }
}

