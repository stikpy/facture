/**
 * Script pour tester directement le chatbot en appelant la fonction POST
 * Utilise le contexte Next.js pour simuler une requête
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

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
 * Appelle directement la fonction POST du route handler
 */
async function callChatbotAPI(message: string, conversationHistory: any[] = []) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`💬 Question: ${message}`)
  if (conversationHistory.length > 0) {
    console.log(`📜 Historique: ${conversationHistory.length} messages`)
  }
  console.log(`${'='.repeat(80)}\n`)

  try {
    // Récupérer un utilisateur et créer une session
    const { data: users } = await supabase.auth.admin.listUsers()
    
    if (!users || users.users.length === 0) {
      console.error('❌ Aucun utilisateur trouvé')
      return null
    }

    const testUser = users.users[0]
    console.log(`👤 Utilisateur: ${testUser.email || testUser.id}`)

    // Créer un token de session pour l'utilisateur
    const { data: session, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: testUser.email || 'test@example.com',
    })

    if (sessionError) {
      console.warn('⚠️  Impossible de créer une session, utilisation du service role')
    }

    // Importer dynamiquement le route handler
    // Note: On doit utiliser une approche différente car Next.js nécessite un contexte de requête
    // On va plutôt faire une requête HTTP si le serveur est en cours d'exécution
    const API_URL = process.env.API_URL || 'http://localhost:3000'
    
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ajouter l'authentification si disponible
        ...(session?.properties?.hashed_token ? {
          'Authorization': `Bearer ${session.properties.hashed_token}`
        } : {}),
      },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Erreur HTTP ${response.status}: ${errorText}`)
      return null
    }

    const data = await response.json()
    const responseText = data.response || data.message || JSON.stringify(data, null, 2)
    
    console.log(`🤖 Réponse:`)
    console.log(responseText)
    console.log(`\n${'─'.repeat(80)}\n`)

    return responseText
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Le serveur Next.js n\'est pas en cours d\'exécution.')
      console.error('   Veuillez démarrer le serveur avec: npm run dev')
      console.error('   Puis relancez ce script.')
    } else {
      console.error(`❌ Erreur: ${error.message}`)
      if (error.stack) {
        console.error(error.stack)
      }
    }
    return null
  }
}

/**
 * Tests progressifs
 */
async function runTests() {
  console.log('🚀 Démarrage des tests de conversation avec le chatbot\n')
  console.log('📋 Assurez-vous que le serveur Next.js est en cours d\'exécution (npm run dev)\n')

  const conversationHistory: any[] = []

  // Questions génériques
  console.log('📌 PHASE 1: Questions génériques\n')
  
  await callChatbotAPI('Combien y a-t-il de factures?', conversationHistory)
  await callChatbotAPI('Quels sont les produits disponibles?', conversationHistory)
  await callChatbotAPI('Combien de fournisseurs ai-je?', conversationHistory)
  await callChatbotAPI('Quels sont les centres de coûts disponibles?', conversationHistory)

  // Questions précises
  console.log('\n📌 PHASE 2: Questions précises\n')
  
  const response1 = await callChatbotAPI('Combien de dépenses pour solide_pdj?', conversationHistory)
  if (response1) {
    conversationHistory.push({ role: 'user', content: 'Combien de dépenses pour solide_pdj?' })
    conversationHistory.push({ role: 'assistant', content: response1 })
  }

  const response2 = await callChatbotAPI('sur l\'année?', conversationHistory)
  if (response2) {
    conversationHistory.push({ role: 'user', content: 'sur l\'année?' })
    conversationHistory.push({ role: 'assistant', content: response2 })
  }

  const response3 = await callChatbotAPI('octobre?', conversationHistory)
  if (response3) {
    conversationHistory.push({ role: 'user', content: 'octobre?' })
    conversationHistory.push({ role: 'assistant', content: response3 })
  }

  // Questions utilisant les outils MCP
  console.log('\n📌 PHASE 3: Questions nécessitant les outils MCP\n')
  
  await callChatbotAPI('Combien y a-t-il de codes TVA?', conversationHistory)
  await callChatbotAPI('Quel est le schéma de la table invoices?', conversationHistory)
  await callChatbotAPI('Quelles sont les tables disponibles?', conversationHistory)

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Tests terminés')
  console.log(`${'='.repeat(80)}\n`)
}

// Exécuter les tests
runTests().catch(console.error)

