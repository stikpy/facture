/**
 * Test direct des outils de base de données pour le chatbot
 * Vérifie que les outils MCP fonctionnent correctement
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { databaseTools } from '../src/lib/ai/database-tools'

// Charger les variables d'environnement
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Récupérer une organisation de test
let testOrganizationId: string | null = null

/**
 * Teste un outil de base de données
 */
async function testTool(toolName: string, args: any) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🔧 Test de l'outil: ${toolName}`)
  console.log(`📝 Arguments: ${JSON.stringify(args, null, 2)}`)
  console.log(`${'='.repeat(80)}\n`)

  try {
    const tool = databaseTools.find(t => t.name === toolName)
    
    if (!tool) {
      console.error(`❌ Outil "${toolName}" non trouvé`)
      return null
    }

    const result = await (tool as any).invoke(args)
    console.log(`✅ Résultat:`)
    console.log(result)
    return result
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
    return null
  }
}

/**
 * Tests progressifs : génériques puis précis
 */
async function runTests() {
  console.log('🚀 Démarrage des tests des outils de base de données\n')

  // Récupérer une organisation de test
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)

  if (orgs && orgs.length > 0) {
    testOrganizationId = orgs[0].id
    console.log(`🏢 Organisation de test: ${testOrganizationId}\n`)
  } else {
    console.error('❌ Aucune organisation trouvée dans la base de données')
    return
  }

  // Test 1: Lister les tables (générique)
  await testTool('list_database_tables', { schema: 'public' })

  // Test 2: Obtenir le schéma d'une table (générique)
  await testTool('get_table_schema', { tableName: 'invoices' })

  // Test 3: Obtenir le schéma d'une autre table
  await testTool('get_table_schema', { tableName: 'invoice_allocations' })

  // Test 4: Recherche générique dans les factures
  await testTool('search_table_data', {
    tableName: 'invoices',
    filters: { 
      organization_id: testOrganizationId,
      status: 'completed' 
    },
    limit: 5,
    description: 'Récupérer quelques factures complétées'
  })

  // Test 5: Recherche dans les allocations (générique)
  await testTool('search_table_data', {
    tableName: 'invoice_allocations',
    filters: { organization_id: testOrganizationId },
    limit: 10,
    description: 'Récupérer quelques allocations'
  })

  // Test 6: Recherche précise par compte comptable
  await testTool('search_table_data', {
    tableName: 'invoice_allocations',
    filters: { 
      organization_id: testOrganizationId,
      account_code: '1003' 
    },
    limit: 10,
    description: 'Récupérer les allocations pour le compte 1003'
  })

  // Test 7: Recherche avec filtre de date (mois spécifique)
  await testTool('search_table_data', {
    tableName: 'invoice_allocations',
    filters: { 
      organization_id: testOrganizationId,
      account_code: '1003',
      invoice_date: '2025-10-01' // Octobre 2025
    },
    limit: 10,
    description: 'Récupérer les allocations pour le compte 1003 en octobre 2025'
  })

  // Test 8: Recherche dans les produits
  await testTool('search_table_data', {
    tableName: 'products',
    filters: { 
      organization_id: testOrganizationId,
      is_active: true 
    },
    limit: 10,
    description: 'Récupérer les produits actifs'
  })

  // Test 9: Recherche dans les comptes comptables
  await testTool('search_table_data', {
    tableName: 'organization_accounts',
    filters: { organization_id: testOrganizationId },
    limit: 20,
    description: 'Récupérer tous les comptes comptables'
  })

  // Test 10: Recherche dans les codes TVA
  await testTool('search_table_data', {
    tableName: 'organization_vat_codes',
    filters: { organization_id: testOrganizationId },
    limit: 20,
    description: 'Récupérer tous les codes TVA'
  })

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Tests terminés')
  console.log(`${'='.repeat(80)}\n`)
}

// Exécuter les tests
runTests().catch(console.error)

