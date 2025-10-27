import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'
import { upsertSupplier } from '@/lib/suppliers'

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

      // POST-VALIDATION: Vérifier que fournisseur ≠ client
      if ((extractedData as any)?.supplier_name && (extractedData as any)?.client_name) {
        const supplierNorm = String((extractedData as any).supplier_name).toLowerCase().trim()
        const clientNorm = String((extractedData as any).client_name).toLowerCase().trim()
        
        if (supplierNorm === clientNorm) {
          console.warn('⚠️ [SERVER] ERREUR DÉTECTÉE: supplier_name = client_name!')
          console.warn(`⚠️ [SERVER] Valeur incorrecte: "${(extractedData as any).supplier_name}"`)
          console.warn('⚠️ [SERVER] Tentative de correction automatique...')
          
          // Essayer d'extraire le nom du fournisseur depuis le nom du fichier
          const fileNameMatch = fileName.match(/^([^-]+)/)
          if (fileNameMatch && fileNameMatch[1]) {
            const supplierFromFileName = fileNameMatch[1].trim()
            console.log(`🔧 [SERVER] Extraction du fournisseur depuis le nom du fichier: "${supplierFromFileName}"`)
            ;(extractedData as any).supplier_name = supplierFromFileName
            console.log(`✅ [SERVER] Correction appliquée: supplier_name = "${supplierFromFileName}"`)
          } else {
            console.error('❌ [SERVER] Impossible de corriger automatiquement, fournisseur invalide')
            ;(extractedData as any).supplier_name = 'FOURNISSEUR INCONNU - À VÉRIFIER'
          }
        }
      }

      const normalizeString = (value: unknown): string | null => {
        if (!value) return null
        const str = String(value).trim()
        return str.length > 0 ? str : null
      }

      const cleanList = (values?: string[]) => (values || [])
        .map(item => normalizeString(item))
        .filter((val): val is string => Boolean(val))

      const allowedDocumentTypes = new Set(['invoice', 'delivery_note', 'credit_note', 'quote', 'other'])

      let documentType = normalizeString((extractedData as any)?.document_type)?.toLowerCase() || 'invoice'
      if (!allowedDocumentTypes.has(documentType)) {
        documentType = 'invoice'
      }

      const deliveryNoteNumber = normalizeString((extractedData as any)?.delivery_note_number)
      const relatedDeliveryNotes = cleanList(extractedData.related_delivery_note_numbers)
      const relatedInvoiceNumbers = cleanList(extractedData.related_invoice_numbers)
      const normalizedInvoiceNumber = normalizeString((extractedData as any)?.invoice_number)

      let documentReference = normalizeString((extractedData as any)?.document_reference)
      if (!documentReference) {
        if (documentType === 'delivery_note') {
          documentReference = deliveryNoteNumber || normalizedInvoiceNumber || null
        } else {
          documentReference = normalizedInvoiceNumber || deliveryNoteNumber || null
        }
      }

      if (documentReference) {
        documentReference = documentReference.replace(/\s+/g, ' ')
      }

      ;(extractedData as any).invoice_number = normalizedInvoiceNumber || undefined
      ;(extractedData as any).document_type = documentType
      ;(extractedData as any).document_reference = documentReference || undefined
      ;(extractedData as any).delivery_note_number = deliveryNoteNumber || undefined
      ;(extractedData as any).related_delivery_note_numbers = relatedDeliveryNotes
      ;(extractedData as any).related_invoice_numbers = relatedInvoiceNumbers

      const classification = await documentProcessor.classifyInvoice(extractedData)
      console.log('✅ [SERVER] Classification:', classification)

      // Upsert supplier avec organization_id de la facture
      try {
        const supplierName = (extractedData as any)?.supplier_name
        if (supplierName) {
          console.log(`🏢 [SERVER] Création/Recherche du fournisseur "${supplierName}" pour l'organisation ${invoice.organization_id}`)
          const supplier = await upsertSupplier(String(supplierName), invoice.organization_id)
          if (supplier) {
            console.log(`✅ [SERVER] Fournisseur associé: ${supplier.display_name} (${supplier.code}, validation_status: ${supplier.validation_status})`)
            await (supabaseAdmin as any)
              .from('invoices')
              .update({ supplier_id: supplier.id } as any)
              .eq('id', fileId)
          }
        }
      } catch (e) { 
        console.error('❌ [SERVER] Erreur lors de l\'upsert du fournisseur:', e)
      }

      const existingPairedId: string | null = (invoice as any).paired_document_id || null
      let pairedDocumentId: string | null = null
      let matchedDocumentPair: string | null = null
      let shouldUpdatePeer = false

      const organizationId = (invoice as any).organization_id

      if (organizationId) {
        if (documentType === 'invoice') {
          const candidateSet = new Set<string>()
          for (const ref of relatedDeliveryNotes) {
            candidateSet.add(ref)
          }
          if (deliveryNoteNumber) {
            candidateSet.add(deliveryNoteNumber)
          }
          const candidateNumbers = Array.from(candidateSet)

          if (candidateNumbers.length > 0) {
            const { data: matches, error: matchError } = await (supabaseAdmin as any)
              .from('invoices')
              .select('id, paired_document_id, document_reference')
              .eq('organization_id', organizationId)
              .eq('document_type', 'delivery_note')
              .in('document_reference', candidateNumbers)
            if (matchError) {
              console.error('❌ [SERVER] Erreur lors de la recherche de bon de livraison lié:', matchError)
            } else if (matches && matches.length > 0) {
              const match = matches.find((m: any) => !m.paired_document_id || m.paired_document_id === fileId)
              if (match) {
                pairedDocumentId = match.id
                matchedDocumentPair = match.paired_document_id
                shouldUpdatePeer = existingPairedId !== match.id
              }
            }
          }
        } else if (documentType === 'delivery_note') {
          const candidateSet = new Set<string>()
          if (documentReference) {
            candidateSet.add(documentReference)
          }
          for (const ref of relatedInvoiceNumbers) {
            candidateSet.add(ref)
          }
          if (normalizedInvoiceNumber) {
            candidateSet.add(normalizedInvoiceNumber)
          }
          const candidateNumbers = Array.from(candidateSet)

          if (candidateNumbers.length > 0) {
            const { data: matches, error: matchError } = await (supabaseAdmin as any)
              .from('invoices')
              .select('id, paired_document_id, document_reference, extracted_data')
              .eq('organization_id', organizationId)
              .eq('document_type', 'invoice')
              .in('document_reference', candidateNumbers)
            if (matchError) {
              console.error('❌ [SERVER] Erreur lors de la recherche de facture liée:', matchError)
            } else if (matches && matches.length > 0) {
              const match = matches.find((m: any) => !m.paired_document_id || m.paired_document_id === fileId)
              if (match) {
                pairedDocumentId = match.id
                matchedDocumentPair = match.paired_document_id
                shouldUpdatePeer = existingPairedId !== match.id
              }
            }
          }
        }
      }

      if (!pairedDocumentId) {
        pairedDocumentId = existingPairedId
      }

      // Sauvegarder les données extraites
      console.log('💾 [SERVER] Sauvegarde des données extraites en base')
      const { error: updateError } = await (supabaseAdmin as any)
        .from('invoices')
        .update({
          extracted_data: extractedData,
          classification: classification.category,
          status: 'completed',
          document_type: documentType,
          document_reference: documentReference,
          paired_document_id: pairedDocumentId ?? null
        } as any)
        .eq('id', fileId)

      if (updateError) {
        console.error('❌ [SERVER] Erreur lors de la sauvegarde:', updateError)
        throw updateError
      }
      console.log('✅ [SERVER] Données sauvegardées avec succès')

      if (shouldUpdatePeer && pairedDocumentId && (!matchedDocumentPair || matchedDocumentPair === fileId)) {
        await (supabaseAdmin as any)
          .from('invoices')
          .update({ paired_document_id: fileId } as any)
          .eq('id', pairedDocumentId)
        console.log(`🔗 [SERVER] Rapprochement établi avec le document ${pairedDocumentId}`)
      }

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
