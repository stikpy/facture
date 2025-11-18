/**
 * Script pour interagir directement avec le chatbot
 * Simule des conversations progressives : génériques puis précises
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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
 * Simule un appel au chatbot en important directement la fonction POST
 */
async function askChatbot(message: string, conversationHistory: any[] = []): Promise<string | null> {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`💬 Question: ${message}`)
  console.log(`${'='.repeat(80)}\n`)

  try {
    // Récupérer un utilisateur de test
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError || !users || users.users.length === 0) {
      console.error('❌ Aucun utilisateur trouvé pour les tests')
      return null
    }

    const testUser = users.users[0]
    console.log(`👤 Utilisateur: ${testUser.email || testUser.id}`)

    // Créer une session pour l'utilisateur
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: testUser.email || 'test@example.com',
    })

    if (sessionError) {
      console.error('❌ Erreur lors de la création de la session:', sessionError)
      // Continuer quand même, on utilisera le service role
    }

    // Appeler directement la fonction POST du route handler
    // On doit importer dynamiquement pour éviter les erreurs de contexte Next.js
    const { POST } = await import('../src/app/api/chat/route')
    
    // Créer une requête simulée
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ajouter les cookies de session si disponibles
        ...(sessionData?.properties?.hashed_token ? {
          'Cookie': `sb-access-token=${sessionData.properties.hashed_token}`
        } : {}),
      },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
      }),
    })

    // Appeler la fonction POST
    const response = await POST(request as any)
    const data = await response.json()

    if (!response.ok) {
      console.error(`❌ Erreur HTTP ${response.status}:`, data.error || data)
      return null
    }

    const responseText = data.response || data.message || JSON.stringify(data, null, 2)
    console.log(`🤖 Réponse:`)
    console.log(responseText)
    console.log(`\n${'─'.repeat(80)}\n`)

    return responseText
  } catch (error: any) {
    console.error(`❌ Erreur lors de l'appel au chatbot: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
    return null
  }
}

/**
 * Tests progressifs : génériques puis précis
 */
async function runConversationTests() {
  console.log('🚀 Démarrage des tests de conversation avec le chatbot\n')
  console.log('📋 Tests progressifs : questions génériques puis précises\n')

  const conversationHistory: any[] = []

  // Test 1: Question générique sur les factures
  const response1 = await askChatbot('Combien y a-t-il de factures?', conversationHistory)
  if (response1) {
    conversationHistory.push({ role: 'user', content: 'Combien y a-t-il de factures?' })
    conversationHistory.push({ role: 'assistant', content: response1 })
  }

  // Test 2: Question sur les produits
  const response2 = await askChatbot('Quels sont les produits disponibles?', conversationHistory)
  if (response2) {
    conversationHistory.push({ role: 'user', content: 'Quels sont les produits disponibles?' })
    conversationHistory.push({ role: 'assistant', content: response2 })
  }

  // Test 3: Question sur les fournisseurs
  const response3 = await askChatbot('Combien de fournisseurs ai-je?', conversationHistory)
  if (response3) {
    conversationHistory.push({ role: 'user', content: 'Combien de fournisseurs ai-je?' })
    conversationHistory.push({ role: 'assistant', content: response3 })
  }

  // Test 4: Question sur les centres de coûts
  const response4 = await askChatbot('Quels sont les centres de coûts disponibles?', conversationHistory)
  if (response4) {
    conversationHistory.push({ role: 'user', content: 'Quels sont les centres de coûts disponibles?' })
    conversationHistory.push({ role: 'assistant', content: response4 })
  }

  // Test 5: Question précise sur un centre de coûts
  const response5 = await askChatbot('Combien de dépenses pour solide_pdj?', conversationHistory)
  if (response5) {
    conversationHistory.push({ role: 'user', content: 'Combien de dépenses pour solide_pdj?' })
    conversationHistory.push({ role: 'assistant', content: response5 })
  }

  // Test 6: Question avec période (année) - question de suivi
  const response6 = await askChatbot('sur l\'année?', conversationHistory)
  if (response6) {
    conversationHistory.push({ role: 'user', content: 'sur l\'année?' })
    conversationHistory.push({ role: 'assistant', content: response6 })
  }

  // Test 7: Question avec mois spécifique - question de suivi
  const response7 = await askChatbot('octobre?', conversationHistory)
  if (response7) {
    conversationHistory.push({ role: 'user', content: 'octobre?' })
    conversationHistory.push({ role: 'assistant', content: response7 })
  }

  // Test 8: Question sur les codes TVA
  const response8 = await askChatbot('Combien y a-t-il de codes TVA?', conversationHistory)
  if (response8) {
    conversationHistory.push({ role: 'user', content: 'Combien y a-t-il de codes TVA?' })
    conversationHistory.push({ role: 'assistant', content: response8 })
  }

  // Test 9: Question sur les allocations
  const response9 = await askChatbot('Combien d\'allocations comptables ai-je?', conversationHistory)
  if (response9) {
    conversationHistory.push({ role: 'user', content: 'Combien d\'allocations comptables ai-je?' })
    conversationHistory.push({ role: 'assistant', content: response9 })
  }

  // Test 10: Question complexe nécessitant plusieurs outils
  const response10 = await askChatbot('Quel est le montant total des factures pour octobre 2025?', conversationHistory)
  if (response10) {
    conversationHistory.push({ role: 'user', content: 'Quel est le montant total des factures pour octobre 2025?' })
    conversationHistory.push({ role: 'assistant', content: response10 })
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Tests de conversation terminés')
  console.log(`${'='.repeat(80)}\n`)
}

// Exécuter les tests
runConversationTests().catch(console.error)

