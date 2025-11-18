/**
 * Script pour recuperer les produits d'une facture
 * Usage: npx tsx scripts/get-invoice-products.ts <invoice_id>
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

async function getInvoiceProducts() {
  console.log(`Recuperation des produits pour la facture: ${invoiceId}\n`)

  try {
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, supplier_id, organization_id, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvee: ${invoiceError?.message || 'Aucune donnee'}`)
    }

    const items = (invoice.extracted_data as any)?.items || []
    const supplierId = invoice.supplier_id
    const organizationId = invoice.organization_id

    console.log(`Facture trouvee: ${invoice.file_name}`)
    console.log(`Fournisseur ID: ${supplierId}`)
    console.log(`Organisation ID: ${organizationId}`)
    console.log(`Nombre d'items extraits: ${items.length}\n`)

    if (supplierId && organizationId) {
      console.log(`Recherche des produits dans la table products...`)
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          suppliers (
            id,
            display_name,
            code
          )
        `)
        .eq('organization_id', organizationId)
        .eq('supplier_id', supplierId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (productsError) {
        console.error('Erreur lors de la recuperation des produits:', productsError)
      } else {
        console.log(`${products?.length || 0} produit(s) trouve(s) dans la table products\n`)

        if (products && products.length > 0) {
          console.log(`Liste des produits:\n`)
          products.forEach((product: any, index: number) => {
            console.log(`${index + 1}. ${product.name}`)
            console.log(`   Reference: ${product.reference || 'Aucune'}`)
            console.log(`   Prix unitaire HT: ${product.price} €`)
            console.log(`   TVA: ${product.vat_rate || 'N/A'}%`)
            console.log(`   Code TVA: ${product.vat_code || 'N/A'}`)
            console.log(`   Unite: ${product.unit || 'piece'}`)
            if (product.description) {
              console.log(`   Description: ${product.description}`)
            }
            console.log(`   Fournisseur: ${product.suppliers?.display_name || 'N/A'} (${product.suppliers?.code || 'N/A'})`)
            console.log('')
          })
        }
      }
    }

    console.log(`\nItems extraits de la facture (${items.length}):\n`)
    
    const itemsByRef = new Map<string, any[]>()
    items.forEach((item: any, idx: number) => {
      const ref = item.reference?.trim() || 'SANS-REF'
      if (!itemsByRef.has(ref)) {
        itemsByRef.set(ref, [])
      }
      itemsByRef.get(ref)!.push({ ...item, index: idx })
    })

    let itemNumber = 1
    itemsByRef.forEach((itemsWithSameRef, ref) => {
      const firstItem = itemsWithSameRef[0]
      console.log(`${itemNumber}. ${firstItem.description || 'Sans description'}`)
      console.log(`   Reference: ${ref === 'SANS-REF' ? 'Aucune' : ref}`)
      console.log(`   Quantite: ${firstItem.quantity || 1}`)
      console.log(`   Prix unitaire: ${firstItem.unit_price || 0} €`)
      console.log(`   Total: ${firstItem.total_price || 0} €`)
      console.log(`   TVA: ${firstItem.tax_rate || 0}%`)
      if (itemsWithSameRef.length > 1) {
        console.log(`   ${itemsWithSameRef.length} occurrences de cet item dans la facture`)
      }
      console.log('')
      itemNumber++
    })

    // Récupérer les produits si pas déjà fait
    let products: any[] = []
    if (supplierId && organizationId) {
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('supplier_id', supplierId)
        .eq('is_active', true)
      products = productsData || []
    }

    if (supplierId && organizationId && products && products.length > 0) {
      console.log(`\nCorrespondance items <-> produits:\n`)
      
      const productMap = new Map<string, any>()
      products.forEach((p: any) => {
        const ref = (p.reference || '').trim()
        if (ref) {
          productMap.set(ref.toLowerCase(), p)
        }
      })

      let matched = 0
      let unmatched = 0

      itemsByRef.forEach((itemsWithSameRef, ref) => {
        const firstItem = itemsWithSameRef[0]
        const itemRef = (firstItem.reference || '').trim().toLowerCase()
        const product = itemRef ? productMap.get(itemRef) : null

        if (product) {
          matched++
          console.log(`OK ${firstItem.description}`)
          console.log(`   Reference: ${ref === 'SANS-REF' ? 'Aucune' : ref}`)
          console.log(`   Produit trouve: ${product.name}`)
          console.log(`   Prix produit: ${product.price} € vs Prix facture: ${firstItem.unit_price} €`)
        } else {
          unmatched++
          console.log(`KO ${firstItem.description}`)
          console.log(`   Reference: ${ref === 'SANS-REF' ? 'Aucune' : ref}`)
          console.log(`   Produit non trouve dans la table products`)
        }
        console.log('')
      })

      console.log(`\nResume:`)
      console.log(`   Items avec produit correspondant: ${matched}`)
      console.log(`   Items sans produit correspondant: ${unmatched}`)
    }

  } catch (error: any) {
    console.error('Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

getInvoiceProducts()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nErreur fatale:', error)
    process.exit(1)
  })
