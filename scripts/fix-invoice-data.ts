/**
 * Script pour corriger les données d'une facture spécifique
 * Usage: npx tsx scripts/fix-invoice-data.ts <invoice_id>
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

const invoiceId = process.argv[2] || '74133749-236b-4d36-9302-2891f78be131'

async function fixInvoiceData() {
  console.log(`🔧 Correction des données de la facture: ${invoiceId}\n`)

  try {
    // 1. Récupérer la facture actuelle
    console.log('📄 Récupération de la facture...')
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvée: ${invoiceError?.message || 'Aucune donnée'}`)
    }

    console.log('✅ Facture trouvée:')
    console.log(`   - Nom fichier: ${invoice.file_name}`)
    console.log(`   - Fournisseur actuel ID: ${invoice.supplier_id}`)
    console.log(`   - Organisation: ${invoice.organization_id}`)
    console.log(`   - Statut: ${invoice.status}`)

    // 2. Récupérer le fournisseur actuel
    if (invoice.supplier_id) {
      const { data: currentSupplier } = await supabase
        .from('suppliers')
        .select('id, display_name, code, validation_status')
        .eq('id', invoice.supplier_id)
        .single()

      if (currentSupplier) {
        console.log(`   - Fournisseur actuel: ${currentSupplier.display_name} (${currentSupplier.code})`)
      }
    }

    // 3. Récupérer les données extraites
    const extractedData = invoice.extracted_data as any
    if (extractedData) {
      console.log(`\n📋 Données extraites:`)
      console.log(`   - Nom fournisseur extrait: ${extractedData.supplier_name}`)
      console.log(`   - Nom client: ${extractedData.client_name}`)
      console.log(`   - Numéro facture: ${extractedData.invoice_number}`)
      console.log(`   - Date facture: ${extractedData.invoice_date}`)
      console.log(`   - Total: ${extractedData.total_amount} €`)
      console.log(`   - Nombre d'items: ${extractedData.items?.length || 0}`)
    }

    // 4. Chercher le bon fournisseur (SYSCO France)
    console.log(`\n🔍 Recherche du fournisseur SYSCO France...`)
    const { data: syscoSupplier, error: syscoError } = await supabase
      .from('suppliers')
      .select('id, display_name, code, validation_status')
      .eq('organization_id', invoice.organization_id)
      .or('display_name.ilike.%SYSCO%,normalized_key.eq.sysco')
      .limit(5)

    if (syscoError) {
      console.error('❌ Erreur lors de la recherche:', syscoError)
    } else if (syscoSupplier && syscoSupplier.length > 0) {
      console.log(`✅ Fournisseur SYSCO trouvé:`)
      syscoSupplier.forEach(s => {
        console.log(`   - ${s.display_name} (${s.code}) - ${s.validation_status}`)
      })

      // Utiliser le premier fournisseur SYSCO trouvé
      const targetSupplier = syscoSupplier[0]
      
      // 5. Mettre à jour la facture avec le bon fournisseur
      console.log(`\n🔄 Mise à jour de la facture...`)
      const { data: updatedInvoice, error: updateError } = await supabase
        .from('invoices')
        .update({
          supplier_id: targetSupplier.id,
          extracted_data: {
            ...extractedData,
            supplier_name: 'SYSCO France'
          }
        })
        .eq('id', invoiceId)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`)
      }

      console.log(`✅ Facture mise à jour avec succès!`)
      console.log(`   - Nouveau fournisseur: ${targetSupplier.display_name} (${targetSupplier.id})`)

      // 6. Synchroniser les produits avec le bon fournisseur
      if (extractedData?.items && extractedData.items.length > 0) {
        console.log(`\n🔄 Synchronisation des produits...`)
        const { syncProductsFromInvoice } = await import('../src/lib/products/sync-products')
        const { synced, errors } = await syncProductsFromInvoice({
          organizationId: invoice.organization_id,
          supplierId: targetSupplier.id,
          items: extractedData.items
        })
        console.log(`✅ ${synced} produit(s) synchronisé(s)`)
        if (errors > 0) {
          console.log(`⚠️  ${errors} erreur(s)`)
        }
      }

    } else {
      console.log(`⚠️  Aucun fournisseur SYSCO trouvé. Création d'un nouveau fournisseur...`)
      
      // Créer le fournisseur SYSCO France
      const { data: newSupplier, error: createError } = await supabase
        .from('suppliers')
        .insert({
          organization_id: invoice.organization_id,
          display_name: 'SYSCO France',
          code: 'SYSCO-001',
          validation_status: 'validated',
          is_active: true
        })
        .select()
        .single()

      if (createError) {
        throw new Error(`Erreur lors de la création du fournisseur: ${createError.message}`)
      }

      console.log(`✅ Fournisseur créé: ${newSupplier.display_name} (${newSupplier.id})`)

      // Mettre à jour la facture
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          supplier_id: newSupplier.id,
          extracted_data: {
            ...extractedData,
            supplier_name: 'SYSCO France'
          }
        })
        .eq('id', invoiceId)

      if (updateError) {
        throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`)
      }

      console.log(`✅ Facture mise à jour avec le nouveau fournisseur`)

      // Synchroniser les produits
      if (extractedData?.items && extractedData.items.length > 0) {
        console.log(`\n🔄 Synchronisation des produits...`)
        const { syncProductsFromInvoice } = await import('../src/lib/products/sync-products')
        const { synced, errors } = await syncProductsFromInvoice({
          organizationId: invoice.organization_id,
          supplierId: newSupplier.id,
          items: extractedData.items
        })
        console.log(`✅ ${synced} produit(s) synchronisé(s)`)
        if (errors > 0) {
          console.log(`⚠️  ${errors} erreur(s)`)
        }
      }
    }

    console.log(`\n✨ Correction terminée avec succès!`)

  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

fixInvoiceData()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  })

