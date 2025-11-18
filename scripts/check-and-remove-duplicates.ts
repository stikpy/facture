/**
 * Script pour verifier et supprimer les doublons restants dans une facture
 * Usage: npx tsx scripts/check-and-remove-duplicates.ts <invoice_id>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Variables d\'environnement manquantes')
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

function normalizeDescription(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeReference(ref: string): string {
  // Normaliser la référence en supprimant les espaces, préfixes communs, et en gardant seulement les caractères alphanumériques
  return ref.trim().toLowerCase()
    .replace(/\s+/g, '') // Supprimer tous les espaces
    .replace(/^(si|l|fi|ost|sl)\s*/i, '') // Supprimer les préfixes communs
    .replace(/[^a-z0-9]/g, '') // Garder seulement les caractères alphanumériques
}

function createItemKey(item: InvoiceItem): string {
  const desc = normalizeDescription(item.description || '')
  const price = item.unit_price || 0
  const quantity = item.quantity || 1
  const total = item.total_price || 0
  // Clé basée sur description + prix unitaire + quantité + total
  // On ignore la référence car elle peut varier (espaces, préfixes) pour le même produit
  // On utilise aussi le total_price pour détecter les doublons même si quantité/prix unitaire diffèrent légèrement
  return `${desc}|${price.toFixed(2)}|${quantity.toFixed(3)}|${total.toFixed(2)}`
}

async function checkAndRemoveDuplicates() {
  console.log(`Verification des doublons pour la facture: ${invoiceId}\n`)

  try {
    // 1. Recuperer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvee: ${invoiceError?.message || 'Aucune donnee'}`)
    }

    const extractedData = invoice.extracted_data as any
    const items = (extractedData?.items || []) as InvoiceItem[]
    
    console.log(`Facture trouvee: ${invoice.file_name}`)
    console.log(`Nombre d'items avant: ${items.length}`)
    console.log(`Subtotal HT extrait: ${extractedData?.subtotal || 0} €`)
    console.log(`Total TTC extrait: ${extractedData?.total_amount || 0} €\n`)

    // 2. Calculer le total HT des items
    const calculateItemHT = (item: InvoiceItem): number => {
      if (item.is_ht === false && item.total_price) {
        const taxMultiplier = 1 + (item.tax_rate || 0) / 100
        return item.total_price / taxMultiplier
      }
      return Number(item.unit_price || 0) * Number(item.quantity || 1)
    }

    const totalHTBefore = items.reduce((sum, item) => sum + calculateItemHT(item), 0)
    console.log(`Total HT calcule depuis items: ${totalHTBefore.toFixed(2)} €`)
    console.log(`Difference avec extrait: ${(totalHTBefore - Number(extractedData?.subtotal || 0)).toFixed(2)} €\n`)

    // 3. Identifier les doublons avec une logique plus robuste
    const seen = new Map<string, { item: InvoiceItem; index: number }>()
    const duplicates: Array<{ index: number; item: InvoiceItem; key: string; reason: string }> = []
    const uniqueItems: InvoiceItem[] = []

    items.forEach((item, index) => {
      const key = createItemKey(item)
      
      if (seen.has(key)) {
        const existing = seen.get(key)!
        duplicates.push({
          index,
          item,
          key,
          reason: `Doublon de l'item #${existing.index + 1} (${existing.item.description?.substring(0, 50)}...)`
        })
        console.log(`Doublon trouve a l'index ${index + 1}:`)
        console.log(`   Description: ${item.description}`)
        console.log(`   Reference: ${item.reference || 'Aucune'}`)
        console.log(`   Prix unitaire: ${item.unit_price} €`)
        console.log(`   Quantite: ${item.quantity}`)
        console.log(`   Total: ${item.total_price} €`)
        console.log(`   Raison: ${duplicates[duplicates.length - 1].reason}\n`)
      } else {
        seen.set(key, { item, index })
        uniqueItems.push(item)
      }
    })

    console.log(`Analyse:`)
    console.log(`   Items uniques: ${uniqueItems.length}`)
    console.log(`   Doublons trouves: ${duplicates.length}\n`)

    if (duplicates.length === 0) {
      console.log(`Aucun doublon trouve.`)
      
      // Verifier s'il y a des items avec des descriptions similaires mais des references differentes
      console.log(`\nVerification des items avec descriptions similaires...`)
      const similarItems = new Map<string, InvoiceItem[]>()
      
      items.forEach((item) => {
        const normalizedDesc = normalizeDescription(item.description || '')
        if (!similarItems.has(normalizedDesc)) {
          similarItems.set(normalizedDesc, [])
        }
        similarItems.get(normalizedDesc)!.push(item)
      })

      let similarCount = 0
      similarItems.forEach((itemsWithSameDesc, desc) => {
        if (itemsWithSameDesc.length > 1) {
          similarCount++
          console.log(`\n${itemsWithSameDesc.length} items avec la meme description: "${desc.substring(0, 60)}..."`)
          itemsWithSameDesc.forEach((item, idx) => {
            console.log(`   ${idx + 1}. Ref: ${item.reference || 'Aucune'}, Prix: ${item.unit_price} €, Qte: ${item.quantity}`)
          })
        }
      })

      if (similarCount > 0) {
        console.log(`\n${similarCount} groupe(s) d'items avec descriptions identiques mais references differentes.`)
      }
      
      return
    }

    // 4. Verifier les totaux apres deduplication
    const totalHTAfter = uniqueItems.reduce((sum, item) => sum + calculateItemHT(item), 0)
    const expectedSubtotal = Number(extractedData?.subtotal || 0)

    console.log(`Totaux:`)
    console.log(`   Total HT avant deduplication: ${totalHTBefore.toFixed(2)} €`)
    console.log(`   Total HT apres deduplication: ${totalHTAfter.toFixed(2)} €`)
    console.log(`   Subtotal attendu (facture): ${expectedSubtotal.toFixed(2)} €\n`)

    // 5. Mettre a jour la facture avec les items uniques
    const updatedExtractedData = {
      ...extractedData,
      items: uniqueItems
    }

    console.log(`Mise a jour de la facture...`)
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ extracted_data: updatedExtractedData })
      .eq('id', invoiceId)

    if (updateError) {
      throw new Error(`Erreur lors de la mise a jour: ${updateError.message}`)
    }

    console.log(`Facture mise a jour avec succes!`)
    console.log(`   Items supprimes: ${duplicates.length}`)
    console.log(`   Items restants: ${uniqueItems.length}`)

    // 6. Mettre a jour les allocations si necessaire
    const { data: allocations } = await supabase
      .from('invoice_allocations')
      .select('*')
      .eq('invoice_id', invoiceId)

    if (allocations && allocations.length > 0) {
      console.log(`\nAttention: ${allocations.length} allocation(s) existante(s).`)
      console.log(`Les indices des articles ont change apres la deduplication.`)
      console.log(`Les allocations doivent etre recalculées via le script fix-invoice-allocations.ts`)
    }

    console.log(`\nDeduplication terminee!`)

  } catch (error: any) {
    console.error('Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

checkAndRemoveDuplicates()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nErreur fatale:', error)
    process.exit(1)
  })

