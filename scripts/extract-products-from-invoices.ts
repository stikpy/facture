/**
 * Script pour extraire les produits des factures et les insérer dans la table products
 * 
 * Usage: npx tsx scripts/extract-products-from-invoices.ts
 * 
 * Ce script :
 * 1. Récupère toutes les factures avec des données extraites contenant des items
 * 2. Extrait les produits de chaque facture
 * 3. Les insère dans la table products en respectant les contraintes d'unicité
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement manquantes:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total_price: number
  tax_rate: number
  is_ht?: boolean
  reference?: string
}

interface ExtractedData {
  items?: InvoiceItem[]
  [key: string]: any
}

interface Invoice {
  id: string
  organization_id: string | null
  supplier_id: string | null
  extracted_data: ExtractedData | null
}

async function extractProductsFromInvoices() {
  console.log('🚀 Début de l\'extraction des produits depuis les factures...\n')

  try {
    // 1. Récupérer toutes les factures avec des données extraites contenant des items
    console.log('📄 Récupération des factures avec des items extraits...')
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, organization_id, supplier_id, extracted_data')
      .not('extracted_data', 'is', null)
      .not('supplier_id', 'is', null)
      .not('organization_id', 'is', null)

    if (invoicesError) {
      throw new Error(`Erreur lors de la récupération des factures: ${invoicesError.message}`)
    }

    if (!invoices || invoices.length === 0) {
      console.log('ℹ️  Aucune facture avec des items extraits trouvée.')
      return
    }

    console.log(`✅ ${invoices.length} facture(s) trouvée(s)\n`)

    // 2. Extraire les produits de chaque facture
    const productsToInsert: Map<string, {
      organization_id: string
      supplier_id: string
      reference: string
      name: string
      price: number
      vat_rate: number | null
      vat_code: string | null
      unit: string
      description: string | null
    }> = new Map()

    let totalItemsProcessed = 0
    let itemsSkipped = 0

    for (const invoice of invoices as Invoice[]) {
      if (!invoice.extracted_data?.items || !Array.isArray(invoice.extracted_data.items)) {
        continue
      }

      if (!invoice.organization_id || !invoice.supplier_id) {
        continue
      }

      for (const item of invoice.extracted_data.items) {
        totalItemsProcessed++

        // Ignorer les items sans référence ou description
        if (!item.reference && !item.description) {
          itemsSkipped++
          continue
        }

        // Utiliser la référence si disponible, sinon générer une clé depuis la description
        const reference = item.reference?.trim() || `AUTO-${item.description?.substring(0, 20).replace(/[^A-Z0-9]/gi, '')}` || 'NO-REF'
        
        // Clé unique pour éviter les doublons dans le même batch
        const uniqueKey = `${invoice.organization_id}-${invoice.supplier_id}-${reference}`
        
        if (productsToInsert.has(uniqueKey)) {
          // Mettre à jour avec les valeurs les plus récentes si nécessaire
          const existing = productsToInsert.get(uniqueKey)!
          // Garder le prix le plus élevé (peut être plus récent)
          if (item.unit_price > existing.price) {
            existing.price = item.unit_price
            existing.vat_rate = item.tax_rate || null
          }
          itemsSkipped++
          continue
        }

        // Déterminer le prix HT
        let price = item.unit_price || 0
        if (item.is_ht === false && item.total_price) {
          // Si le prix est TTC, calculer le HT
          const taxMultiplier = 1 + (item.tax_rate || 0) / 100
          price = item.total_price / taxMultiplier / (item.quantity || 1)
        } else if (item.total_price && item.quantity) {
          // Utiliser le prix unitaire calculé depuis le total
          price = item.total_price / item.quantity
        }

        // Déterminer l'unité (essayer de l'inférer depuis la description)
        let unit = 'pièce'
        const descriptionLower = item.description?.toLowerCase() || ''
        if (descriptionLower.includes('kg') || descriptionLower.includes('kilo')) {
          unit = 'kg'
        } else if (descriptionLower.includes('litre') || descriptionLower.includes('l ')) {
          unit = 'litre'
        } else if (descriptionLower.includes('mètre') || descriptionLower.includes('m ')) {
          unit = 'mètre'
        }

        productsToInsert.set(uniqueKey, {
          organization_id: invoice.organization_id,
          supplier_id: invoice.supplier_id,
          reference: reference,
          name: item.description?.trim() || 'Produit sans nom',
          price: Math.max(0, price), // S'assurer que le prix est positif
          vat_rate: item.tax_rate || null,
          vat_code: null, // Sera rempli manuellement ou via mapping
          unit: unit,
          description: item.description?.trim() || null
        })
      }
    }

    console.log(`📊 Statistiques:`)
    console.log(`   - Items traités: ${totalItemsProcessed}`)
    console.log(`   - Items ignorés (sans référence/description): ${itemsSkipped}`)
    console.log(`   - Produits uniques à insérer: ${productsToInsert.size}\n`)

    if (productsToInsert.size === 0) {
      console.log('ℹ️  Aucun produit à insérer.')
      return
    }

    // 3. Insérer les produits dans la base de données (avec gestion des doublons)
    console.log('💾 Insertion des produits dans la base de données...')
    
    const productsArray = Array.from(productsToInsert.values())
    const batchSize = 100
    let inserted = 0
    let updated = 0
    let errors = 0

    for (let i = 0; i < productsArray.length; i += batchSize) {
      const batch = productsArray.slice(i, i + batchSize)
      
      // Utiliser upsert pour gérer les doublons (basé sur la contrainte unique)
      const { data, error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'organization_id,supplier_id,reference',
          ignoreDuplicates: false
        })
        .select()

      if (error) {
        console.error(`❌ Erreur lors de l'insertion du batch ${Math.floor(i / batchSize) + 1}:`, error.message)
        errors += batch.length
        continue
      }

      // Compter les insertions vs mises à jour
      // Note: Supabase upsert ne distingue pas facilement insert vs update
      // On considère que si on a des données retournées, c'est un succès
      if (data && data.length > 0) {
        inserted += data.length
      }
    }

    console.log(`\n✅ Extraction terminée!`)
    console.log(`   - Produits insérés/mis à jour: ${inserted}`)
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
extractProductsFromInvoices()
  .then(() => {
    console.log('\n✨ Script terminé avec succès!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur lors de l\'exécution du script:', error)
    process.exit(1)
  })

