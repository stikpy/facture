/**
 * Script pour supprimer les doublons dans les items extraits d'une facture
 * Usage: npx tsx scripts/remove-duplicate-items.ts <invoice_id>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const invoiceId = process.argv[2] || '74133749-236b-4d36-9302-2891f78be131'

interface InvoiceItem {
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate?: number
  is_ht?: boolean
  reference?: string
}

function normalizeItem(item: InvoiceItem): string {
  // Créer une clé unique basée sur la description et la référence
  const desc = (item.description || '').trim().toLowerCase()
  const ref = (item.reference || '').trim().toLowerCase()
  return `${desc}|${ref}`
}

async function removeDuplicateItems() {
  console.log(`🔧 Suppression des doublons pour la facture: ${invoiceId}\n`)

  try {
    // 1. Récupérer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvée: ${invoiceError?.message || 'Aucune donnée'}`)
    }

    const extractedData = invoice.extracted_data as any
    const items = (extractedData?.items || []) as InvoiceItem[]
    
    console.log(`✅ Facture trouvée: ${invoice.file_name}`)
    console.log(`   - Nombre d'items avant: ${items.length}`)
    console.log(`   - Subtotal HT: ${extractedData?.subtotal || 0} €`)
    console.log(`   - Total TTC: ${extractedData?.total_amount || 0} €\n`)

    // 2. Identifier les doublons
    const seen = new Map<string, { item: InvoiceItem; index: number }>()
    const duplicates: Array<{ index: number; item: InvoiceItem; key: string }> = []
    const uniqueItems: InvoiceItem[] = []

    items.forEach((item, index) => {
      const key = normalizeItem(item)
      
      if (seen.has(key)) {
        duplicates.push({ index, item, key })
        console.log(`🔍 Doublon trouvé à l'index ${index}:`)
        console.log(`   - Description: ${item.description}`)
        console.log(`   - Référence: ${item.reference || 'Aucune'}`)
        console.log(`   - Prix unitaire: ${item.unit_price} €`)
        console.log(`   - Quantité: ${item.quantity}`)
        console.log(`   - Total: ${item.total_price} €`)
        console.log(`   - Clé: ${key}\n`)
      } else {
        seen.set(key, { item, index })
        uniqueItems.push(item)
      }
    })

    console.log(`📊 Analyse:`)
    console.log(`   - Items uniques: ${uniqueItems.length}`)
    console.log(`   - Doublons trouvés: ${duplicates.length}\n`)

    if (duplicates.length === 0) {
      console.log(`✅ Aucun doublon trouvé. Aucune action nécessaire.`)
      return
    }

    // 3. Vérifier les totaux après déduplication
    const calculateItemHT = (item: InvoiceItem): number => {
      if (item.is_ht === false && item.total_price) {
        const taxMultiplier = 1 + (item.tax_rate || 0) / 100
        return item.total_price / taxMultiplier
      }
      return Number(item.unit_price || 0) * Number(item.quantity || 1)
    }

    const totalHTBefore = items.reduce((sum, item) => sum + calculateItemHT(item), 0)
    const totalHTAfter = uniqueItems.reduce((sum, item) => sum + calculateItemHT(item), 0)
    const expectedSubtotal = Number(extractedData?.subtotal || 0)

    console.log(`💰 Totaux:`)
    console.log(`   - Total HT avant déduplication: ${totalHTBefore.toFixed(2)} €`)
    console.log(`   - Total HT après déduplication: ${totalHTAfter.toFixed(2)} €`)
    console.log(`   - Subtotal attendu (facture): ${expectedSubtotal.toFixed(2)} €\n`)

    // 4. Mettre à jour la facture avec les items uniques
    const updatedExtractedData = {
      ...extractedData,
      items: uniqueItems
    }

    console.log(`🔄 Mise à jour de la facture...`)
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ extracted_data: updatedExtractedData })
      .eq('id', invoiceId)

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`)
    }

    console.log(`✅ Facture mise à jour avec succès!`)
    console.log(`   - Items supprimés: ${duplicates.length}`)
    console.log(`   - Items restants: ${uniqueItems.length}`)

    // 5. Mettre à jour les allocations si nécessaire
    // Les allocations doivent être recalculées car les indices ont changé
    const { data: allocations } = await supabase
      .from('invoice_allocations')
      .select('*')
      .eq('invoice_id', invoiceId)

    if (allocations && allocations.length > 0) {
      console.log(`\n⚠️  Attention: ${allocations.length} allocation(s) existante(s).`)
      console.log(`   Les indices des articles ont changé après la déduplication.`)
      console.log(`   Les allocations doivent être recalculées manuellement ou via le script fix-invoice-allocations.ts`)
    }

    console.log(`\n✨ Déduplication terminée!`)

  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

removeDuplicateItems()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  })

