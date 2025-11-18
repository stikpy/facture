/**
 * Script de test pour le chatbot avec outils MCP
 * Teste différentes questions génériques puis précises
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Charger les variables d'environnement
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/**
 * Simule un appel au chatbot
 */
async function testChatbot(message: string, conversationHistory: any[] = []) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📝 Question: ${message}`)
  console.log(`${'='.repeat(80)}\n`)

  try {
    // Récupérer un utilisateur de test (premier utilisateur trouvé)
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError || !users || users.users.length === 0) {
      console.error('❌ Aucun utilisateur trouvé pour les tests')
      return
    }

    const testUser = users.users[0]
    console.log(`👤 Utilisateur de test: ${testUser.email || testUser.id}`)

    // Récupérer l'organisation de l'utilisateur
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', testUser.id)
      .single()

    if (!membership) {
      console.error('❌ Aucune organisation trouvée pour l\'utilisateur')
      return
    }

    console.log(`🏢 Organisation: ${membership.organization_id}`)

    // Simuler l'appel API (on teste directement la logique)
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: En production, il faudrait un vrai token d'authentification
      },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`❌ Erreur HTTP ${response.status}: ${error}`)
      return
    }

    const data = await response.json()
    console.log(`✅ Réponse reçue:`)
    console.log(data.response || data.error || JSON.stringify(data, null, 2))

    return data
  } catch (error: any) {
    console.error(`❌ Erreur lors du test: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
  }
}

/**
 * Tests progressifs : génériques puis précis
 */
async function runTests() {
  console.log('🚀 Démarrage des tests du chatbot avec outils MCP\n')

  // Test 1: Question générique sur les factures
  await testChatbot('Combien y a-t-il de factures?')

  // Test 2: Question sur les produits
  await testChatbot('Quels sont les produits disponibles?')

  // Test 3: Question sur les fournisseurs
  await testChatbot('Combien de fournisseurs ai-je?')

  // Test 4: Question sur les centres de coûts
  await testChatbot('Quels sont les centres de coûts disponibles?')

  // Test 5: Question précise sur un centre de coûts
  await testChatbot('Combien de dépenses pour solide_pdj?')

  // Test 6: Question avec période (année)
  const history1 = [
    { role: 'user', content: 'Combien de dépenses pour solide_pdj?' },
    { role: 'assistant', content: 'Pour l\'année 2025, les dépenses pour le centre "1003: solide_pdj" s\'élèvent à 4,489.92 € HT.' },
  ]
  await testChatbot('sur l\'année?', history1)

  // Test 7: Question avec mois spécifique
  const history2 = [
    { role: 'user', content: 'Combien de dépenses pour solide_pdj sur l\'année?' },
    { role: 'assistant', content: 'Pour l\'année 2025, les dépenses pour le centre "1003: solide_pdj" s\'élèvent à 4,489.92 € HT.' },
  ]
  await testChatbot('octobre?', history2)

  // Test 8: Question sur les codes TVA
  await testChatbot('Combien y a-t-il de codes TVA?')

  // Test 9: Question sur les allocations
  await testChatbot('Combien d\'allocations comptables ai-je?')

  // Test 10: Question complexe nécessitant plusieurs outils
  await testChatbot('Quel est le montant total des factures pour octobre 2025?')

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Tests terminés')
  console.log(`${'='.repeat(80)}\n`)
}

// Exécuter les tests
runTests().catch(console.error)

