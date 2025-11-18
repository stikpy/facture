import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { DocumentProcessor } from '@/lib/ai/document-processor'
import { OCRProcessor } from '@/lib/ai/ocr-processor'
import { upsertSupplier } from '@/lib/suppliers'
import { recordTokenUsage } from '@/lib/token-usage'
import { syncProductsFromInvoice } from '@/lib/products/sync-products'

export const maxDuration = 300 // 5 minutes max pour Vercel
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  console.log('🔄 [WORKER] Démarrage du worker')
  const startedAt = Date.now()
  const time = () => `${Date.now() - startedAt}ms`
  
  try {
    // Récupérer la prochaine tâche à traiter
    // Exclure les tâches qui ont une erreur de quota récente (moins de 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data: task, error: taskError } = await (supabaseAdmin
      .from('processing_queue')
      .select('*, invoices(*)')
      .eq('status', 'pending')
      .lt('attempts', 5) // Max 5 tentatives (augmenté pour gérer les quotas)
      // Exclure les tâches avec erreur de quota récente
      .or(`error_message.is.null,error_message.not.ilike.%quota%,updated_at.lt.${twoMinutesAgo}`)
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
    {
      const { error } = await (supabaseAdmin as any)
        .from('processing_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: (task as any).attempts + 1
        } as any)
        .eq('id', (task as any).id)
      if (error) throw new Error(`DB update processing_queue: ${error.message}`)
    }

    // Mettre à jour le statut de la facture
    {
      const { error } = await (supabaseAdmin as any)
        .from('invoices')
        .update({ status: 'processing' } as any)
        .eq('id', (task as any).invoice_id)
      if (error) throw new Error(`DB update invoices->processing: ${error.message}`)
    }

    let invoiceRef: any = null
    try {
      const invoice = (task as any).invoices
      invoiceRef = invoice
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
      console.log('[WORKER] Buffer téléchargé (bytes):', fileBuffer?.length, '|', time())

      let extractedText = ''
      let pageTexts: string[] = []
      let alternativeTexts: Array<{rotation: number, score: number, text: string}> = []
      
      // Heuristique: extraire depuis le bloc "FACTURE" la date et le numéro
      const parseHeaderFromText = (txt: string): { headerDate?: string, headerNumber?: string } => {
        try {
          const s = String(txt || '')
          const toIso = (d: string) => {
            const [dd, mm, yy] = d.split('/')
            let yyyy = yy
            if (yy.length === 2) {
              const n = parseInt(yy, 10)
              yyyy = (n >= 70 ? 1900 + n : 2000 + n).toString()
            }
            return `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
          }

          const idx = s.toLowerCase().indexOf('facture')
          const windowStart = Math.max(0, idx === -1 ? 0 : idx - 400)
          const windowEnd = Math.min(s.length, idx === -1 ? Math.min(1000, s.length) : idx + 800)
          const w = s.slice(windowStart, windowEnd)

          // Numéro: "FACTURE N° 3350928854" ou variantes
          const numMatch = w.match(/FACTURE\s*(?:N[°ºo]?|No|N°)\s*([A-Za-z0-9\-\/]+)/i) || w.match(/N[°ºo]?\s*:?\s*([A-Za-z0-9\-\/]+)\b.*?FACTURE/i)

          // Date proche, mais ignorer échéance / impression / livraison
          const dateCandidates = Array.from(w.matchAll(/Date\s*:?[\s]*([0-3]?\d\/[01]?\d\/[12]?\d{2,3}\d)/gi))
            .map(m => m[1])
            .filter(Boolean)
          let pickedDate: string | undefined
          if (dateCandidates.length) {
            // choisir la première date dont la ligne ne contient pas de mots exclus
            const lines = w.split(/\r?\n/)
            for (const d of dateCandidates) {
              const line = lines.find(L => L.includes(d)) || ''
              if (!/(échéance|echeance|impression|livraison)/i.test(line)) { pickedDate = d; break }
            }
            if (!pickedDate) pickedDate = dateCandidates[0]
          }

          const headerDate = pickedDate ? toIso(pickedDate) : undefined
          const headerNumber = numMatch ? numMatch[1] : undefined
          return { headerDate, headerNumber }
        } catch { return {} }
      }

      // Extraction de texte selon le type
      if ((invoice as any).mime_type === 'application/pdf') {
        console.log('📄 [WORKER] Traitement PDF avec OCR')
        const ocrProcessor = new OCRProcessor()
        const tOcrStart = Date.now()
        const texts = await ocrProcessor.processPDF(fileBuffer)
        console.log('[WORKER] OCR PDF textes (n):', texts.length, 'tailles:', texts.map(t => t?.length), '| ocr=', Date.now() - tOcrStart, 'ms')
        extractedText = texts.join('\n')
        pageTexts = texts
        
        // Récupérer les rotations alternatives
        alternativeTexts = ocrProcessor.getAlternativeRotations()
        if (alternativeTexts.length > 0) {
          console.log('[WORKER] Rotations alternatives récupérées:', alternativeTexts.length)
        }
        
        await ocrProcessor.terminate()
      } else if ((invoice as any).mime_type.startsWith('image/')) {
        console.log('🖼️ [WORKER] Traitement image avec OCR')
        const ocrProcessor = new OCRProcessor()
        extractedText = await ocrProcessor.processImage(fileBuffer)
        await ocrProcessor.terminate()
      }

      console.log('[WORKER] Taille texte extrait:', extractedText?.length, '|', time())
      const headerHints = parseHeaderFromText(extractedText)
      if (headerHints.headerDate || headerHints.headerNumber) {
        console.log('[WORKER] Header hints from FACTURE:', headerHints)
      }

      // Heuristique fournisseur depuis l'en-tête (zone top document)
      const parseSupplierFromHeader = (txt: string): string | null => {
        try {
          const rawLines = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          const top = rawLines.slice(0, 40)
          const banned = /(facture|facturation|client|destinataire|livraison|n°|code client|siret|tva|iban|email|tél|adresse)/i
          const candidates = top
            .filter(l => l.length >= 4 && !banned.test(l))
            .map(l => l.replace(/\s{2,}/g, ' ').trim())
          // Favoriser les lignes en MAJUSCULES avec lettres
          let best: string | null = null
          for (const l of candidates) {
            const hasLetters = /[A-Za-zÀ-ÿ]/.test(l)
            const isUpperish = l === l.toUpperCase()
            if (hasLetters && isUpperish) { best = l; break }
          }
          return best || null
        } catch { return null }
      }
      const supplierHeaderCandidate = parseSupplierFromHeader(extractedText)
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

      // Traitement IA (avec retry sur rotations alternatives si extraction vide)
      console.log('🤖 [WORKER] Traitement IA')
      const documentProcessor = new DocumentProcessor((invoice as any).organization_id)
      const tAiStart = Date.now()
      let extractedData = await documentProcessor.processDocument(extractedText, (invoice as any).file_name)
      console.log('[WORKER] IA extraction done in', Date.now() - tAiStart, 'ms')

      // Enregistrer la consommation de tokens pour l'extraction principale
      const tokenUsage = (extractedData as any).__tokenUsage
      if (tokenUsage && (invoice as any).organization_id) {
        await recordTokenUsage({
          organization_id: (invoice as any).organization_id,
          invoice_id: (task as any).invoice_id,
          model_name: 'gpt-5-mini',
          input_tokens: tokenUsage.input_tokens || 0,
          output_tokens: tokenUsage.output_tokens || 0,
          total_tokens: tokenUsage.total_tokens || 0,
          operation_type: 'extraction',
        })
      }

      // Post-correction: si la date/numéro de l'en-tête FACTURE est trouvée, les privilégier
      try {
        const ed: any = extractedData || {}
        if (headerHints.headerDate && ed.invoice_date && ed.invoice_date !== headerHints.headerDate) {
          console.log('[WORKER] Override invoice_date from header FACTURE', { old: ed.invoice_date, fromHeader: headerHints.headerDate })
          ed.invoice_date = headerHints.headerDate
        } else if (headerHints.headerDate && !ed.invoice_date) {
          ed.invoice_date = headerHints.headerDate
          console.log('[WORKER] Set invoice_date from header FACTURE', { fromHeader: headerHints.headerDate })
        }
        if (headerHints.headerNumber && ed.invoice_number && String(ed.invoice_number) !== String(headerHints.headerNumber)) {
          console.log('[WORKER] Override invoice_number from header FACTURE', { old: ed.invoice_number, fromHeader: headerHints.headerNumber })
          ed.invoice_number = headerHints.headerNumber
        } else if (headerHints.headerNumber && !ed.invoice_number) {
          ed.invoice_number = headerHints.headerNumber
          console.log('[WORKER] Set invoice_number from header FACTURE', { fromHeader: headerHints.headerNumber })
        }
        extractedData = ed
      } catch {}

      // Post-correction: si un nom fournisseur fiable est trouvé en tête, le privilégier
      try {
        const ed: any = extractedData || {}
        // Cas spécial SYSCO (mise en page atypique)
        if (/\bSYSCO\b/i.test(extractedText) && !/client/i.test(String(ed?.supplier_name||''))) {
          const syscoName = 'SYSCO France'
          if (!ed.supplier_name || !String(ed.supplier_name).toLowerCase().includes('sysco')) {
            console.log('[WORKER] Override supplier_name (heuristique SYSCO):', { from: ed.supplier_name, to: syscoName })
            ed.supplier_name = syscoName
          }
        }
        if (supplierHeaderCandidate) {
          // Liste des mots-clés de document à ignorer (pas des noms de fournisseurs)
          const documentKeywords = [
            'DUPLICATA', 'DUPLICATE', 'ORIGINAL', 'FACTURE', 'INVOICE', 
            'BON DE COMMANDE', 'BON DE LIVRAISON', 'BL', 'BC',
            'AVOIR', 'CREDIT NOTE', 'NOTE DE CREDIT',
            'DEVIS', 'QUOTE', 'QUOTATION',
            'RECU', 'RECEPTION', 'RECEIPT'
          ]
          const candUpper = supplierHeaderCandidate.toUpperCase().trim()
          const isDocumentKeyword = documentKeywords.some(keyword => 
            candUpper === keyword || candUpper.includes(keyword)
          )
          
          // Vérifier si le fournisseur actuel existe déjà dans la base
          let currentSupplierExists = false
          if (ed.supplier_name && (invoice as any).organization_id) {
            try {
              const { normalizeSupplier } = await import('@/lib/suppliers')
              const normalizedCurrent = normalizeSupplier(ed.supplier_name)
              const { data: existingSupplier } = await (supabaseAdmin as any)
                .from('suppliers')
                .select('id')
                .eq('organization_id', (invoice as any).organization_id)
                .eq('normalized_key', normalizedCurrent)
                .maybeSingle()
              currentSupplierExists = !!existingSupplier
            } catch (e) {
              console.warn('[WORKER] Erreur lors de la vérification du fournisseur existant:', e)
            }
          }
          
          const clientNorm = String(ed.client_name || '').toLowerCase().trim()
          const candNorm = supplierHeaderCandidate.toLowerCase().trim()
          
          // Ne remplacer que si :
          // 1. Ce n'est pas un mot-clé de document
          // 2. Ce n'est pas le nom du client
          // 3. Le fournisseur actuel n'existe pas déjà dans la base (ou n'est pas défini)
          if (!isDocumentKeyword && (!clientNorm || candNorm !== clientNorm)) {
            if (!currentSupplierExists) {
              console.log('[WORKER] Override supplier_name from header top block', { old: ed.supplier_name, fromHeader: supplierHeaderCandidate })
              ed.supplier_name = supplierHeaderCandidate
              extractedData = ed
            } else {
              console.log('[WORKER] Conserve supplier_name existant (trouvé en base)', { 
                current: ed.supplier_name, 
                headerCandidate: supplierHeaderCandidate,
                reason: 'Fournisseur déjà enregistré'
              })
            }
          } else if (isDocumentKeyword) {
            console.log('[WORKER] Ignore header candidate (mot-clé de document)', { 
              candidate: supplierHeaderCandidate,
              current: ed.supplier_name
            })
          }
        }
      } catch {}
      
      // POST-VALIDATION: Vérifier que fournisseur ≠ client
      if ((extractedData as any)?.supplier_name && (extractedData as any)?.client_name) {
        const supplierNorm = String((extractedData as any).supplier_name).toLowerCase().trim()
        const clientNorm = String((extractedData as any).client_name).toLowerCase().trim()
        
        if (supplierNorm === clientNorm) {
          console.warn('⚠️ [WORKER] ERREUR DÉTECTÉE: supplier_name = client_name!')
          console.warn(`⚠️ [WORKER] Valeur incorrecte: "${(extractedData as any).supplier_name}"`)
          console.warn('⚠️ [WORKER] Tentative de correction automatique...')
          
          // Essayer d'extraire le nom du fournisseur depuis le nom du fichier
          const fileNameMatch = (invoice as any).file_name.match(/^([^-]+)/)
          if (fileNameMatch && fileNameMatch[1]) {
            const supplierFromFileName = fileNameMatch[1].trim()
            console.log(`🔧 [WORKER] Extraction du fournisseur depuis le nom du fichier: "${supplierFromFileName}"`)
            ;(extractedData as any).supplier_name = supplierFromFileName
            console.log(`✅ [WORKER] Correction appliquée: supplier_name = "${supplierFromFileName}"`)
          } else {
            console.error('❌ [WORKER] Impossible de corriger automatiquement, fournisseur invalide')
            ;(extractedData as any).supplier_name = 'FOURNISSEUR INCONNU - À VÉRIFIER'
          }
        }
      }
      
      // Fallback: si supplier_name est vide, tenter de le déduire du nom de fichier
      if (!(extractedData as any)?.supplier_name) {
        try {
          const fn = String((invoice as any).file_name || '')
          // Prendre la partie avant le premier '-' ou '_' puis nettoyer
          const raw = fn.split(/[\-_]/)[0] || ''
          const candidate = raw.replace(/\.[a-z0-9]+$/i, '').trim()
          if (candidate && candidate.length >= 3) {
            (extractedData as any).supplier_name = candidate
            console.log(`🔧 [WORKER] supplier_name déduit du nom du fichier: "${candidate}"`)
          }
        } catch {}
      }

      const tClassStart = Date.now()
      let classification = await documentProcessor.classifyInvoice(extractedData)
      console.log('[WORKER] IA classification done in', Date.now() - tClassStart, 'ms')

      // Enregistrer la consommation de tokens pour la classification
      const classificationTokenUsage = (classification as any).__tokenUsage
      if (classificationTokenUsage && (invoice as any).organization_id) {
        await recordTokenUsage({
          organization_id: (invoice as any).organization_id,
          invoice_id: (task as any).invoice_id,
          model_name: 'gpt-5-mini',
          input_tokens: classificationTokenUsage.input_tokens || 0,
          output_tokens: classificationTokenUsage.output_tokens || 0,
          total_tokens: classificationTokenUsage.total_tokens || 0,
          operation_type: 'classification',
        })
      }
      
      // Vérifier si l'extraction a échoué (tous les champs importants sont null)
      const isExtractionEmpty = !extractedData.invoice_number && 
                                !extractedData.total_amount && 
                                !extractedData.supplier_name &&
                                (!extractedData.items || extractedData.items.length === 0)
      
      if (isExtractionEmpty && alternativeTexts.length > 0) {
        console.warn('⚠️ [WORKER] Extraction vide, tentative avec rotations alternatives...')
        
        for (let i = 0; i < Math.min(alternativeTexts.length, 2); i++) {
          const alt = alternativeTexts[i]
          console.log(`🔄 [WORKER] Retry ${i + 1}/${alternativeTexts.length} avec rotation ${alt.rotation}° (score: ${alt.score})`)
          
          const retryData = await documentProcessor.processDocument(alt.text, (invoice as any).file_name)
          const retryIsEmpty = !retryData.invoice_number && 
                               !retryData.total_amount && 
                               !retryData.supplier_name &&
                               (!retryData.items || retryData.items.length === 0)
          
          // Enregistrer les tokens du retry
          const retryTokenUsage = (retryData as any).__tokenUsage
          if (retryTokenUsage && (invoice as any).organization_id) {
            await recordTokenUsage({
              organization_id: (invoice as any).organization_id,
              invoice_id: (task as any).invoice_id,
              model_name: 'gpt-5-mini',
              input_tokens: retryTokenUsage.input_tokens || 0,
              output_tokens: retryTokenUsage.output_tokens || 0,
              total_tokens: retryTokenUsage.total_tokens || 0,
              operation_type: 'extraction',
            })
          }
          
          if (!retryIsEmpty) {
            console.log(`✅ [WORKER] Extraction réussie avec rotation ${alt.rotation}°`)
            extractedData = retryData
            const retryClassification = await documentProcessor.classifyInvoice(extractedData)
            classification = retryClassification
            
            // Enregistrer les tokens de la classification du retry
            const retryClassTokenUsage = (retryClassification as any).__tokenUsage
            if (retryClassTokenUsage && (invoice as any).organization_id) {
              await recordTokenUsage({
                organization_id: (invoice as any).organization_id,
                invoice_id: (task as any).invoice_id,
                model_name: 'gpt-5-mini',
                input_tokens: retryClassTokenUsage.input_tokens || 0,
                output_tokens: retryClassTokenUsage.output_tokens || 0,
                total_tokens: retryClassTokenUsage.total_tokens || 0,
                operation_type: 'classification',
              })
            }
            break
          } else {
            console.log(`❌ [WORKER] Retry ${i + 1} toujours vide`)
          }
        }
      }

      // Si nous avons des textes page par page, faire un enrichissement par page et fusionner les items
      if (pageTexts && pageTexts.length > 1) {
        console.log('[WORKER] Enrichissement page-à-page et fusion des lignes…')
        for (let i = 0; i < pageTexts.length; i++) {
          const pageText = pageTexts[i]
          try {
            const perPage = await documentProcessor.processDocument(pageText, `${(invoice as any).file_name}#p${i+1}`)
            // Enregistrer les tokens de l'enrichissement par page
            const perPageTokenUsage = (perPage as any).__tokenUsage
            if (perPageTokenUsage && (invoice as any).organization_id) {
              await recordTokenUsage({
                organization_id: (invoice as any).organization_id,
                invoice_id: (task as any).invoice_id,
                model_name: 'gpt-5-mini',
                input_tokens: perPageTokenUsage.input_tokens || 0,
                output_tokens: perPageTokenUsage.output_tokens || 0,
                total_tokens: perPageTokenUsage.total_tokens || 0,
                operation_type: 'extraction',
              })
            }
            if (perPage?.items?.length) {
              const current = Array.isArray(extractedData.items) ? extractedData.items : []
              extractedData.items = [...current, ...perPage.items]
            }
          } catch (e) {
            console.warn(`[WORKER] Enrichissement page ${i+1} ignoré:`, e)
          }
        }
        // Recalcul de classification après fusion
        const finalClassification = await documentProcessor.classifyInvoice(extractedData)
        classification = finalClassification
        
        // Enregistrer les tokens de la classification finale
        const finalClassTokenUsage = (finalClassification as any).__tokenUsage
        if (finalClassTokenUsage && (invoice as any).organization_id) {
          await recordTokenUsage({
            organization_id: (invoice as any).organization_id,
            invoice_id: (task as any).invoice_id,
            model_name: 'gpt-5-mini',
            input_tokens: finalClassTokenUsage.input_tokens || 0,
            output_tokens: finalClassTokenUsage.output_tokens || 0,
            total_tokens: finalClassTokenUsage.total_tokens || 0,
            operation_type: 'classification',
          })
        }
      }
      
      // Log de synthèse pour corréler avec l'affichage UI
      try {
        const ed: any = extractedData || {}
        const summary = {
          invoice_id: (task as any).invoice_id,
          file_name: (invoice as any).file_name,
          supplier_name: ed.supplier_name || null,
          client_name: ed.client_name || null,
          invoice_number: ed.invoice_number || null,
          invoice_date: ed.invoice_date || null,
          due_date: ed.due_date || null,
          totals: {
            subtotal: ed.subtotal ?? null,
            tax_amount: ed.tax_amount ?? null,
            total_amount: ed.total_amount ?? null,
          },
          currency: ed.currency || null,
          items_count: Array.isArray(ed.items) ? ed.items.length : 0,
        }
        console.log('[WORKER] Extracted summary:', summary)
      } catch {}

      console.log('[WORKER] Classification:', classification)
      console.log('[WORKER] ===== DONNÉES EXTRAITES (JSON) =====')
      console.log(JSON.stringify(extractedData, null, 2))
      console.log('[WORKER] ====================================')

      // Nettoyage supplémentaire: éviter d'enregistrer l'adresse/TVA du CLIENT dans les champs fournisseur si l'IA s'est trompée
      try {
        const ed: any = extractedData || {}
        if (ed.supplier_name && ed.client_name) {
          const s = String(ed.supplier_name).toLowerCase().trim()
          const c = String(ed.client_name).toLowerCase().trim()
          if (s === c) {
            // On a déjà corrigé le nom; pour les méta (adresse/TVA), si elles sont identiques côté client, on les vide
            if (ed.supplier_address && ed.client_address && String(ed.supplier_address).toLowerCase().trim() === String(ed.client_address).toLowerCase().trim()) {
              ed.supplier_address = undefined
            }
            if (ed.supplier_vat_number && ed.client_vat_number && String(ed.supplier_vat_number).toLowerCase().trim() === String(ed.client_vat_number).toLowerCase().trim()) {
              ed.supplier_vat_number = undefined
            }
          }
        }
      } catch (e) {
        console.warn('[WORKER] Nettoyage supplier/client ignoré:', e)
      }

      // Upsert supplier avec organization_id de la facture
      let supplierId: string | null = null
      try {
        const supplierName = (extractedData as any)?.supplier_name
        if (supplierName && (invoice as any).organization_id) {
          console.log(`🏢 [WORKER] Création/Recherche du fournisseur "${supplierName}" pour l'organisation ${(invoice as any).organization_id}`)
          const tUpsertStart = Date.now()
          const supplier = await upsertSupplier(String(supplierName), (invoice as any).organization_id)
          if (supplier) {
            supplierId = supplier.id
            console.log(`✅ [WORKER] Fournisseur associé: ${supplier.display_name} (${supplier.code}, validation_status: ${supplier.validation_status}) | upsert=`, Date.now() - tUpsertStart, 'ms')
          }
        } else {
          console.warn('⚠️ [WORKER] Impossible de créer le fournisseur: supplierName ou organization_id manquant')
        }
      } catch (e) { 
        console.error('❌ [WORKER] Erreur lors de l\'upsert du fournisseur:', e)
      }

      // Sauvegarder les résultats
      console.log('💾 [WORKER] Sauvegarde des résultats')
      {
        const updateData: any = {
          extracted_data: extractedData,
          classification: classification.category,
          status: 'completed'
        }
        
        // Ajouter le supplier_id si créé
        if (supplierId) {
          updateData.supplier_id = supplierId
        }
        
        const tSaveStart = Date.now()
        const { error } = await (supabaseAdmin as any)
          .from('invoices')
          .update(updateData)
          .eq('id', (task as any).invoice_id)
        if (error) {
          // Gère les doublons de numéro de facture (contrainte unique côté BDD)
          const msg = String((error as any).message || '')
          if ((error as any).code === '23505' || msg.includes('uniq_invoice_per_user_number') || msg.includes('uniq_invoice_per_org_supplier_number')) {
            console.warn('⚠️ [WORKER] Doublon numéro de facture détecté, marquage en erreur')
            await (supabaseAdmin as any)
              .from('invoices')
              .update({
                status: 'duplicate',
                extracted_data: {
                  ...(extractedData as any),
                  duplicate: true,
                  note: 'Déjà importée — doublon de numéro'
                }
              } as any)
              .eq('id', (task as any).invoice_id)

            await (supabaseAdmin as any)
              .from('processing_queue')
              .update({ status: 'completed', error_message: 'duplicate_invoice_number' } as any)
              .eq('id', (task as any).id)

            return NextResponse.json({ success: true, duplicate: true })
          }
          throw new Error(`DB update invoices->completed: ${error.message}`)
        }
        console.log('[WORKER] Save invoices done in', Date.now() - tSaveStart, 'ms')
        try {
          // Snapshot après sauvegarde pour vérifier ce que l'UI peut lire
          const { data: saved } = await (supabaseAdmin as any)
            .from('invoices')
            .select('id, status, classification, organization_id, supplier_id, extracted_data')
            .eq('id', (task as any).invoice_id)
            .single()

          const ed: any = (saved as any)?.extracted_data || {}
          const asNum = (v: any) => typeof v === 'number' ? Number(v.toFixed(2)) : null
          const mismatch: any = {}
          if (asNum(ed.subtotal) !== asNum((extractedData as any)?.subtotal)) mismatch.subtotal = { saved: ed.subtotal, extracted: (extractedData as any)?.subtotal }
          if (asNum(ed.tax_amount) !== asNum((extractedData as any)?.tax_amount)) mismatch.tax_amount = { saved: ed.tax_amount, extracted: (extractedData as any)?.tax_amount }
          if (asNum(ed.total_amount) !== asNum((extractedData as any)?.total_amount)) mismatch.total_amount = { saved: ed.total_amount, extracted: (extractedData as any)?.total_amount }

          console.log('[WORKER] Saved snapshot:', {
            id: (saved as any)?.id,
            status: (saved as any)?.status,
            classification: (saved as any)?.classification,
            organization_id: (saved as any)?.organization_id,
            supplier_id: (saved as any)?.supplier_id,
            extracted: {
              supplier_name: ed?.supplier_name || null,
              client_name: ed?.client_name || null,
              invoice_number: ed?.invoice_number || null,
              invoice_date: ed?.invoice_date || null,
              due_date: ed?.due_date || null,
              subtotal: ed?.subtotal ?? null,
              tax_amount: ed?.tax_amount ?? null,
              total_amount: ed?.total_amount ?? null,
              items_count: Array.isArray(ed?.items) ? ed.items.length : 0,
            },
            mismatch
          })
        } catch (snapErr) {
          console.warn('[WORKER] Snapshot post-save échoué:', snapErr)
        }
      }

      // Créer les articles de facture
      if (extractedData.items && extractedData.items.length > 0) {
        const items = extractedData.items.map((item: any) => ({
          invoice_id: (task as any).invoice_id,
          // référence si disponible (colonne ajoutée conditionnellement par migration)
          reference: item.reference ?? null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))

        {
          const { error } = await (supabaseAdmin as any)
            .from('invoice_items')
            .insert(items as any)
          if (error) throw new Error(`DB insert invoice_items: ${error.message}`)
        }

        // Synchroniser les produits vers la table products
        if ((invoice as any).organization_id && (invoice as any).supplier_id) {
          console.log('🔄 [WORKER] Synchronisation des produits vers la table products...')
          try {
            const { synced, errors } = await syncProductsFromInvoice({
              organizationId: (invoice as any).organization_id,
              supplierId: (invoice as any).supplier_id,
              items: extractedData.items
            })
            if (synced > 0) {
              console.log(`✅ [WORKER] ${synced} produit(s) synchronisé(s)`)
            }
            if (errors > 0) {
              console.warn(`⚠️ [WORKER] ${errors} erreur(s) lors de la synchronisation des produits`)
            }
          } catch (syncError: any) {
            console.warn('⚠️ [WORKER] Erreur lors de la synchronisation des produits (non bloquant):', syncError.message)
            // Ne pas bloquer le traitement si la synchronisation échoue
          }
        }
      }

      // Marquer la tâche comme complétée
      {
        const { error } = await (supabaseAdmin as any)
          .from('processing_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          } as any)
          .eq('id', (task as any).id)
        if (error) throw new Error(`DB update processing_queue->completed: ${error.message}`)
      }

      console.log('✅ [WORKER] Tâche complétée avec succès | total=', time())

      return NextResponse.json({
        success: true,
        taskId: (task as any).id,
        invoiceId: (task as any).invoice_id
      })

    } catch (processingError) {
      console.error('❌ [WORKER] Erreur traitement:', processingError)

      const error = processingError as Error & { isQuotaError?: boolean; statusCode?: number }
      const isQuotaError = error.isQuotaError || error.statusCode === 429 || error.message?.includes('429') || error.message?.includes('quota')

      // Pour les erreurs de quota, on remet en pending avec un délai plus long
      // Pour les autres erreurs, on suit la logique normale
      const maxAttempts = isQuotaError ? 5 : 3 // Plus de tentatives pour les erreurs de quota
      const newStatus = (task as any).attempts + 1 >= maxAttempts ? 'failed' : 'pending'

      // Si c'est une erreur de quota et qu'on n'a pas atteint le max, on remet en pending
      // Le worker réessayera plus tard (les limites se réinitialisent par minute/heure)
      if (isQuotaError && (task as any).attempts + 1 < maxAttempts) {
        console.log('⚠️ [WORKER] Erreur de quota détectée. La tâche sera réessayée plus tard.')
        await (supabaseAdmin as any)
          .from('processing_queue')
          .update({
            status: 'pending',
            error_message: `Quota dépassé (tentative ${(task as any).attempts + 1}/${maxAttempts}). Réessai automatique prévu.`,
            // Réinitialiser started_at pour permettre un nouveau traitement
            started_at: null
          } as any)
          .eq('id', (task as any).id)

        await (supabaseAdmin as any)
          .from('invoices')
          .update({
            status: 'queued',
            extracted_data: { 
              ...((invoiceRef as any)?.extracted_data || {}),
              quota_error: true,
              quota_retry_at: new Date(Date.now() + 60000).toISOString() // Réessayer dans 1 minute
            }
          } as any)
          .eq('id', (task as any).invoice_id)

        return NextResponse.json(
          {
            error: 'Quota OpenAI dépassé',
            message: 'La tâche sera réessayée automatiquement dans quelques instants.',
            retry: true
          },
          { status: 429 }
        )
      }

      // Pour les autres erreurs ou si max tentatives atteintes
      await (supabaseAdmin as any)
        .from('processing_queue')
        .update({
          status: newStatus,
          error_message: error.message
        } as any)
        .eq('id', (task as any).id)

      await (supabaseAdmin as any)
        .from('invoices')
        .update({
          status: 'error',
          extracted_data: { 
            ...((invoiceRef as any)?.extracted_data || {}),
            error: error.message 
          }
        } as any)
        .eq('id', (task as any).invoice_id)

      return NextResponse.json(
        {
          error: 'Erreur lors du traitement',
          message: error.message
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

