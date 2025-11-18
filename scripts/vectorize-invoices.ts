/**
 * Script pour vectoriser toutes les factures existantes et les stocker dans document_embeddings
 * 
 * Usage: npm run vectorize-invoices
 * 
 * Ce script :
 * 1. Récupère toutes les factures avec des données extraites
 * 2. Divise chaque facture en chunks
 * 3. Génère les embeddings pour chaque chunk
 * 4. Stocke les embeddings dans la table document_embeddings
 */

import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from '@langchain/openai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('❌ Variables d\'environnement manquantes:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  console.error('   - OPENAI_API_KEY:', !!openaiApiKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: openaiApiKey,
  modelName: 'text-embedding-3-small', // 1536 dimensions
})

interface Invoice {
  id: string
  organization_id: string | null
  supplier_id: string | null
  file_name: string
  extracted_data: any
}

function buildDocumentText(invoice: Invoice): string {
  const ed = invoice.extracted_data || {}
  const parts: string[] = []

  // Informations générales
  if (ed.supplier_name) parts.push(`Fournisseur: ${ed.supplier_name}`)
  if (ed.client_name) parts.push(`Client: ${ed.client_name}`)
  if (ed.invoice_number) parts.push(`Numéro de facture: ${ed.invoice_number}`)
  if (ed.invoice_date) parts.push(`Date de facture: ${ed.invoice_date}`)
  if (ed.due_date) parts.push(`Date d'échéance: ${ed.due_date}`)
  
  // Montants
  if (ed.subtotal) parts.push(`Sous-total HT: ${ed.subtotal} €`)
  if (ed.tax_amount) parts.push(`Montant TVA: ${ed.tax_amount} €`)
  if (ed.total_amount) parts.push(`Total TTC: ${ed.total_amount} €`)

  // Articles
  if (Array.isArray(ed.items) && ed.items.length > 0) {
    parts.push('\nArticles:')
    ed.items.forEach((item: any, index: number) => {
      const itemParts: string[] = []
      if (item.reference) itemParts.push(`Réf: ${item.reference}`)
      if (item.description) itemParts.push(item.description)
      if (item.quantity) itemParts.push(`Qté: ${item.quantity}`)
      if (item.unit_price) itemParts.push(`PU: ${item.unit_price} €`)
      if (item.total_price) itemParts.push(`Total: ${item.total_price} €`)
      if (item.tax_rate) itemParts.push(`TVA: ${item.tax_rate}%`)
      parts.push(`  ${index + 1}. ${itemParts.join(' - ')}`)
    })
  }

  // Notes et autres informations
  if (ed.notes) parts.push(`\nNotes: ${ed.notes}`)
  if (ed.payment_terms) parts.push(`Conditions de paiement: ${ed.payment_terms}`)

  return parts.join('\n')
}

async function vectorizeInvoices() {
  console.log('🚀 Début de la vectorisation des factures...\n')

  try {
    // 1. Récupérer toutes les factures avec des données extraites
    console.log('📄 Récupération des factures...')
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, organization_id, supplier_id, file_name, extracted_data')
      .not('extracted_data', 'is', null)
      .not('organization_id', 'is', null)
      .eq('status', 'completed')

    if (invoicesError) {
      throw new Error(`Erreur lors de la récupération des factures: ${invoicesError.message}`)
    }

    if (!invoices || invoices.length === 0) {
      console.log('ℹ️  Aucune facture avec des données extraites trouvée.')
      return
    }

    console.log(`✅ ${invoices.length} facture(s) trouvée(s)\n`)

    // 2. Vérifier si les embeddings existent déjà
    const { data: existingEmbeddings } = await supabase
      .from('document_embeddings')
      .select('invoice_id')
      .limit(1)

    if (existingEmbeddings && existingEmbeddings.length > 0) {
      console.log('⚠️  Des embeddings existent déjà. Voulez-vous les supprimer et recommencer ?')
      console.log('   Pour supprimer: DELETE FROM document_embeddings;')
      console.log('   Continuons avec les nouvelles factures uniquement...\n')
    }

    // 3. Diviser et vectoriser chaque facture
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    })

    let totalChunks = 0
    let totalEmbeddings = 0
    let errors = 0

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i] as Invoice
      
      if (!invoice.organization_id) {
        continue
      }

      try {
        // Vérifier si cette facture a déjà des embeddings
        const { data: existing } = await supabase
          .from('document_embeddings')
          .select('id')
          .eq('invoice_id', invoice.id)
          .limit(1)

        if (existing && existing.length > 0) {
          console.log(`⏭️  [${i + 1}/${invoices.length}] Facture ${invoice.id} déjà vectorisée, ignorée`)
          continue
        }

        console.log(`📝 [${i + 1}/${invoices.length}] Traitement de la facture ${invoice.file_name}...`)

        // Construire le texte du document
        const documentText = buildDocumentText(invoice)
        
        if (!documentText.trim()) {
          console.log(`   ⚠️  Aucun contenu à vectoriser`)
          continue
        }

        // Diviser en chunks
        const docs = await splitter.createDocuments([documentText])
        totalChunks += docs.length

        // Générer les embeddings pour tous les chunks
        console.log(`   🔄 Génération de ${docs.length} embedding(s)...`)
        const embeddingsList = await embeddings.embedDocuments(
          docs.map(doc => doc.pageContent)
        )

        // Préparer les métadonnées
        const ed = invoice.extracted_data || {}
        const baseMetadata = {
          invoice_id: invoice.id,
          file_name: invoice.file_name,
          supplier_name: ed.supplier_name || null,
          client_name: ed.client_name || null,
          invoice_number: ed.invoice_number || null,
          invoice_date: ed.invoice_date || null,
          total_amount: ed.total_amount || null,
          items_count: Array.isArray(ed.items) ? ed.items.length : 0,
        }

        // Insérer les embeddings dans la base de données
        const embeddingsToInsert = docs.map((doc, chunkIndex) => ({
          invoice_id: invoice.id,
          organization_id: invoice.organization_id!,
          content: doc.pageContent,
          metadata: baseMetadata,
          embedding: embeddingsList[chunkIndex],
          chunk_index: chunkIndex,
        }))

        const { error: insertError } = await supabase
          .from('document_embeddings')
          .insert(embeddingsToInsert)

        if (insertError) {
          console.error(`   ❌ Erreur lors de l'insertion:`, insertError.message)
          errors++
          continue
        }

        totalEmbeddings += embeddingsToInsert.length
        console.log(`   ✅ ${embeddingsToInsert.length} embedding(s) inséré(s)`)

        // Petite pause pour éviter de surcharger l'API OpenAI
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error: any) {
        console.error(`   ❌ Erreur lors du traitement de la facture ${invoice.id}:`, error.message)
        errors++
      }
    }

    console.log(`\n✅ Vectorisation terminée!`)
    console.log(`   - Factures traitées: ${invoices.length}`)
    console.log(`   - Chunks créés: ${totalChunks}`)
    console.log(`   - Embeddings insérés: ${totalEmbeddings}`)
    if (errors > 0) {
      console.log(`   - Erreurs: ${errors}`)
    }

  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Exécuter le script
vectorizeInvoices()
  .then(() => {
    console.log('\n✨ Script terminé avec succès!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur lors de l\'exécution du script:', error)
    process.exit(1)
  })

