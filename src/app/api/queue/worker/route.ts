import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'

export const maxDuration = 300 // 5 minutes max pour Vercel
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  console.log('🔄 [WORKER] Démarrage du worker')
  const startedAt = Date.now()
  
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
    console.log('[WORKER] Tâche:', {
      id: (task as any).id,
      invoiceId: (task as any).invoice_id,
      attempts: (task as any).attempts,
      created_at: (task as any).created_at
    })

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
      console.log('[WORKER] Facture:', {
        id: (invoice as any).id,
        file_name: (invoice as any).file_name,
        file_path: (invoice as any).file_path,
        mime_type: (invoice as any).mime_type,
        organization_id: (invoice as any).organization_id
      })

      // Télécharger le fichier
      console.log(`📥 [WORKER] Téléchargement du fichier: ${(invoice as any).file_path}`)
      const storageService = new StorageService()
      const fileBuffer = await storageService.downloadFile((invoice as any).file_path)
      console.log('[WORKER] Buffer téléchargé (bytes):', fileBuffer?.length)

      let extractedText = ''

      // Extraction de texte selon le type
      if ((invoice as any).mime_type === 'application/pdf') {
        console.log('📄 [WORKER] Traitement PDF avec OCR')
        const ocrProcessor = new OCRProcessor()
        const texts = await ocrProcessor.processPDF(fileBuffer)
        console.log('[WORKER] OCR PDF textes (n):', texts.length, 'tailles:', texts.map(t => t?.length))
        extractedText = texts.join('\n')
        await ocrProcessor.terminate()
      } else if ((invoice as any).mime_type.startsWith('image/')) {
        console.log('🖼️ [WORKER] Traitement image avec OCR')
        const ocrProcessor = new OCRProcessor()
        extractedText = await ocrProcessor.processImage(fileBuffer)
        await ocrProcessor.terminate()
      }

      console.log('[WORKER] Taille texte extrait:', extractedText?.length)
      if (!extractedText.trim()) {
        console.warn('[WORKER] PDF scanné sans texte - marquage pour OCR manuel')
        // Marquer comme "needs_manual_ocr" au lieu de throw
        await (supabaseAdmin as any)
          .from('invoices')
          .update({
            status: 'error',
            extracted_data: { 
              error: 'PDF scanné - OCR manuel requis',
              note: 'Ce document nécessite un traitement OCR avancé ou une extraction manuelle'
            }
          } as any)
          .eq('id', (task as any).invoice_id)
        
        await (supabaseAdmin as any)
          .from('processing_queue')
          .update({
            status: 'failed',
            error_message: 'PDF scanné - OCR manuel requis'
          } as any)
          .eq('id', (task as any).id)
        
        return NextResponse.json({
          success: false,
          message: 'PDF scanné - nécessite OCR manuel',
          invoiceId: (task as any).invoice_id
        })
      }

      // Traitement IA
      console.log('🤖 [WORKER] Traitement IA')
      const documentProcessor = new DocumentProcessor()
      const extractedData = await documentProcessor.processDocument(extractedText, (invoice as any).file_name)
      const classification = await documentProcessor.classifyInvoice(extractedData)
      console.log('[WORKER] Classification:', classification)
      console.log('[WORKER] ===== DONNÉES EXTRAITES =====')
      console.log(JSON.stringify(extractedData, null, 2))
      console.log('[WORKER] ==============================')

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

