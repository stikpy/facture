import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { fileId, fileName } = await request.json()

    if (!fileId) {
      return NextResponse.json({ error: 'ID de fichier requis' }, { status: 400 })
    }

    // Récupérer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Facture non trouvée' }, { status: 404 })
    }

    // Mettre à jour le statut
    await supabase
      .from('invoices')
      .update({ status: 'processing' })
      .eq('id', fileId)

    try {
      // Télécharger le fichier
      const storageService = new StorageService()
      const fileBuffer = await storageService.downloadFile(invoice.file_path)

      let extractedText = ''

      // Traitement selon le type de fichier
      if (invoice.mime_type === 'application/pdf') {
        const ocrProcessor = new OCRProcessor()
        const texts = await ocrProcessor.processPDF(fileBuffer)
        extractedText = texts.join('\n')
        await ocrProcessor.terminate()
      } else if (invoice.mime_type.startsWith('image/')) {
        const ocrProcessor = new OCRProcessor()
        extractedText = await ocrProcessor.processImage(fileBuffer)
        await ocrProcessor.terminate()
      }

      if (!extractedText.trim()) {
        throw new Error('Aucun texte extrait du document')
      }

      // Traitement avec l'IA
      const documentProcessor = new DocumentProcessor()
      const extractedData = await documentProcessor.processDocument(extractedText, fileName)
      const classification = await documentProcessor.classifyInvoice(extractedData)

      // Sauvegarder les données extraites
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          extracted_data: extractedData,
          classification: classification.category,
          status: 'completed'
        })
        .eq('id', fileId)

      if (updateError) {
        throw updateError
      }

      // Créer les articles de facture si disponibles
      if (extractedData.items && extractedData.items.length > 0) {
        const items = extractedData.items.map(item => ({
          invoice_id: fileId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))

        await supabase
          .from('invoice_items')
          .insert(items)
      }

      return NextResponse.json({
        success: true,
        extractedData,
        classification
      })

    } catch (processingError) {
      console.error('Erreur traitement:', processingError)
      
      // Mettre à jour le statut d'erreur
      await supabase
        .from('invoices')
        .update({ 
          status: 'error',
          extracted_data: { error: (processingError as Error).message }
        })
        .eq('id', fileId)

      return NextResponse.json(
        { error: 'Erreur lors du traitement du document' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Erreur API process:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
