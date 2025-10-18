import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'

export async function POST(request: NextRequest) {
  console.log('🚀 [SERVER] Début de la requête POST /api/process')
  
  try {
    console.log('🔧 [SERVER] Création du client Supabase serveur')
    const supabase = await createClient()
    
    // Vérifier l'authentification (cookies puis Authorization Bearer)
    console.log('🔐 [SERVER] Vérification de l\'authentification')
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
      console.error('❌ [SERVER] Erreur d\'authentification:', authError)
      return NextResponse.json({ error: 'Erreur d\'authentification: ' + (authError?.message || 'Auth session missing!') }, { status: 401 })
    }
    
    console.log(`✅ [SERVER] Utilisateur authentifié: ${user.email} (ID: ${user.id})`)

    console.log('📄 [SERVER] Récupération des données de la requête')
    const { fileId, fileName } = await request.json()
    console.log(`📁 [SERVER] Paramètres reçus: fileId=${fileId}, fileName=${fileName}`)

    if (!fileId) {
      console.error('❌ [SERVER] ID de fichier manquant')
      return NextResponse.json({ error: 'ID de fichier requis' }, { status: 400 })
    }

    // Récupérer la facture (bypass RLS, avec contrôle d'ownership)
    console.log(`🔍 [SERVER] Récupération de la facture avec l'ID: ${fileId}`)
    const { data: invoice, error: invoiceError } = await (supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', fileId)
      .single() as any)

    if (invoiceError) {
      console.error('❌ [SERVER] Erreur lors de la récupération de la facture:', invoiceError)
      return NextResponse.json({ error: 'Erreur lors de la récupération de la facture: ' + invoiceError.message }, { status: 404 })
    }
    
    if (!(invoice as any)) {
      console.error('❌ [SERVER] Facture non trouvée')
      return NextResponse.json({ error: 'Facture non trouvée' }, { status: 404 })
    }
    if ((invoice as any).user_id !== user.id) {
      console.error('❌ [SERVER] Accès interdit à la facture')
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })
    }
    
    console.log(`✅ [SERVER] Facture trouvée: ${invoice.file_name} (${invoice.mime_type})`)

    // Mettre à jour le statut
    console.log('🔄 [SERVER] Mise à jour du statut vers "processing"')
    await (supabaseAdmin as any)
      .from('invoices')
      .update({ status: 'processing' } as any)
      .eq('id', fileId)

    try {
      // Télécharger le fichier
      console.log(`📥 [SERVER] Téléchargement du fichier depuis: ${invoice.file_path}`)
      const storageService = new StorageService()
      const fileBuffer = await storageService.downloadFile(invoice.file_path)
      console.log(`📦 [SERVER] Fichier téléchargé: ${fileBuffer.length} bytes`)

      let extractedText = ''

      // Traitement selon le type de fichier
      console.log(`🔍 [SERVER] Début de l'extraction de texte (type: ${invoice.mime_type})`)
      if (invoice.mime_type === 'application/pdf') {
        console.log('📄 [SERVER] Traitement PDF avec OCR')
        const ocrProcessor = new OCRProcessor()
        const texts = await ocrProcessor.processPDF(fileBuffer)
        extractedText = texts.join('\n')
        await ocrProcessor.terminate()
        console.log(`✅ [SERVER] Texte extrait du PDF: ${extractedText.length} caractères`)
      } else if (invoice.mime_type.startsWith('image/')) {
        console.log('🖼️ [SERVER] Traitement image avec OCR')
        const ocrProcessor = new OCRProcessor()
        extractedText = await ocrProcessor.processImage(fileBuffer)
        await ocrProcessor.terminate()
        console.log(`✅ [SERVER] Texte extrait de l'image: ${extractedText.length} caractères`)
      }

      if (!extractedText.trim()) {
        console.error('❌ [SERVER] Aucun texte extrait du document')
        throw new Error('Aucun texte extrait du document')
      }

      // Traitement avec l'IA
      console.log('🤖 [SERVER] Début du traitement IA')
      const documentProcessor = new DocumentProcessor()
      const extractedData = await documentProcessor.processDocument(extractedText, fileName)
      console.log('✅ [SERVER] Données extraites par l\'IA:', extractedData)
      
      const classification = await documentProcessor.classifyInvoice(extractedData)
      console.log('✅ [SERVER] Classification:', classification)

      // Sauvegarder les données extraites
      console.log('💾 [SERVER] Sauvegarde des données extraites en base')
      const { error: updateError } = await (supabaseAdmin as any)
        .from('invoices')
        .update({
          extracted_data: extractedData,
          classification: classification.category,
          status: 'completed'
        } as any)
        .eq('id', fileId)

      if (updateError) {
        console.error('❌ [SERVER] Erreur lors de la sauvegarde:', updateError)
        throw updateError
      }
      console.log('✅ [SERVER] Données sauvegardées avec succès')

      // Créer les articles de facture si disponibles
      if (extractedData.items && extractedData.items.length > 0) {
        console.log(`📋 [SERVER] Création de ${extractedData.items.length} articles de facture`)
        const items = extractedData.items.map(item => ({
          invoice_id: fileId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))

        await (supabaseAdmin as any)
          .from('invoice_items')
          .insert(items as any)
        console.log('✅ [SERVER] Articles de facture créés')
      }

      const response = {
        success: true,
        extractedData,
        classification
      }
      
      console.log('🎉 [SERVER] Traitement terminé avec succès:', response)
      return NextResponse.json(response)

    } catch (processingError) {
      console.error('❌ [SERVER] Erreur traitement:', processingError)
      
      // Mettre à jour le statut d'erreur
      console.log('🔄 [SERVER] Mise à jour du statut vers "error"')
      await (supabaseAdmin as any)
        .from('invoices')
        .update({ 
          status: 'error',
          extracted_data: { error: (processingError as Error).message }
        } as any)
        .eq('id', fileId)

      return NextResponse.json(
        { error: 'Erreur lors du traitement du document: ' + (processingError as Error).message },
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
