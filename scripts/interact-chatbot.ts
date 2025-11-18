/**
 * Script pour interagir directement avec le chatbot
 * Gère l'authentification et simule une conversation complète
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Charger les variables d'environnement
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Appelle le chatbot avec authentification
 */
async function askChatbot(message: string, conversationHistory: any[] = [], accessToken?: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`💬 Question: ${message}`)
  if (conversationHistory.length > 0) {
    console.log(`📜 Historique: ${conversationHistory.length} messages précédents`)
  }
  console.log(`${'='.repeat(80)}\n`)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers,
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
    } else {
      console.error(`❌ Erreur: ${error.message}`)
    }
    return null
  }
}

/**
 * Obtient un token d'accès pour un utilisateur en créant une session admin
 */
async function getAccessToken(): Promise<string | null> {
  try {
    // Récupérer le premier utilisateur
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (usersError || !users || users.users.length === 0) {
      console.error('❌ Aucun utilisateur trouvé')
      return null
    }

    const testUser = users.users[0]
    console.log(`👤 Utilisateur: ${testUser.email || testUser.id}`)

    // Créer un token JWT en utilisant l'API admin de Supabase
    // L'endpoint correct est /auth/v1/admin/users/{user_id}/tokens
    try {
      const authUrl = SUPABASE_URL.replace('/rest/v1', '')
      const response = await fetch(`${authUrl}/auth/v1/admin/users/${testUser.id}/tokens`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_in: 3600, // 1 heure
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const token = data.access_token || data.token
        if (token) {
          console.log('✅ Token JWT créé avec succès')
          return token
        }
      } else {
        const errorText = await response.text()
        console.warn(`⚠️  Erreur API admin (${response.status}): ${errorText.substring(0, 200)}`)
      }
    } catch (err: any) {
      console.warn(`⚠️  Erreur lors de l'appel API: ${err.message}`)
    }

    // Alternative: créer une session en utilisant signInAsUser (nécessite Supabase v2)
    try {
      // Utiliser directement le client admin pour créer un token
      // Note: Cette méthode peut ne pas être disponible dans toutes les versions
      const { data: sessionData } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email || 'test@example.com',
        email_confirm: true,
      })

      if (sessionData?.user) {
        // Essayer de créer une session pour cet utilisateur
        const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
          email: testUser.email || 'test@example.com',
          password: 'temp_password', // Ne fonctionnera probablement pas
        })

        if (signInData?.session?.access_token) {
          return signInData.session.access_token
        }
      }
    } catch (err) {
      // Ignorer cette erreur
    }

    console.warn('⚠️  Impossible de créer un token JWT, les requêtes échoueront probablement')
    console.warn('   Pour tester, vous devez être connecté dans le navigateur')
    return null
  } catch (error: any) {
    console.error(`❌ Erreur lors de l'obtention du token: ${error.message}`)
    return null
  }
}

/**
 * Tests progressifs : génériques puis précis
 */
async function runConversation() {
  console.log('🚀 Démarrage de la conversation avec le chatbot\n')
  console.log('📋 Tests progressifs : questions génériques puis précises\n')

  // Obtenir un token d'accès
  const accessToken = await getAccessToken()
  if (!accessToken) {
    console.warn('⚠️  Aucun token d\'accès, les requêtes peuvent échouer')
  }

  const conversationHistory: any[] = []

  // PHASE 1: Questions génériques
  console.log('\n📌 PHASE 1: Questions génériques\n')
  
  const q1 = await askChatbot('Combien y a-t-il de factures?', conversationHistory, accessToken || undefined)
  if (q1) {
    conversationHistory.push({ role: 'user', content: 'Combien y a-t-il de factures?' })
    conversationHistory.push({ role: 'assistant', content: q1 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000)) // Pause entre les questions

  const q2 = await askChatbot('Quels sont les produits disponibles?', conversationHistory, accessToken || undefined)
  if (q2) {
    conversationHistory.push({ role: 'user', content: 'Quels sont les produits disponibles?' })
    conversationHistory.push({ role: 'assistant', content: q2 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q3 = await askChatbot('Combien de fournisseurs ai-je?', conversationHistory, accessToken || undefined)
  if (q3) {
    conversationHistory.push({ role: 'user', content: 'Combien de fournisseurs ai-je?' })
    conversationHistory.push({ role: 'assistant', content: q3 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q4 = await askChatbot('Quels sont les centres de coûts disponibles?', conversationHistory, accessToken || undefined)
  if (q4) {
    conversationHistory.push({ role: 'user', content: 'Quels sont les centres de coûts disponibles?' })
    conversationHistory.push({ role: 'assistant', content: q4 })
  }

  // PHASE 2: Questions précises
  console.log('\n📌 PHASE 2: Questions précises\n')

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q5 = await askChatbot('Combien de dépenses pour solide_pdj?', conversationHistory, accessToken || undefined)
  if (q5) {
    conversationHistory.push({ role: 'user', content: 'Combien de dépenses pour solide_pdj?' })
    conversationHistory.push({ role: 'assistant', content: q5 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q6 = await askChatbot('sur l\'année?', conversationHistory, accessToken || undefined)
  if (q6) {
    conversationHistory.push({ role: 'user', content: 'sur l\'année?' })
    conversationHistory.push({ role: 'assistant', content: q6 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q7 = await askChatbot('octobre?', conversationHistory, accessToken || undefined)
  if (q7) {
    conversationHistory.push({ role: 'user', content: 'octobre?' })
    conversationHistory.push({ role: 'assistant', content: q7 })
  }

  // PHASE 3: Questions utilisant les outils MCP
  console.log('\n📌 PHASE 3: Questions nécessitant les outils MCP\n')

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q8 = await askChatbot('Combien y a-t-il de codes TVA?', conversationHistory, accessToken || undefined)
  if (q8) {
    conversationHistory.push({ role: 'user', content: 'Combien y a-t-il de codes TVA?' })
    conversationHistory.push({ role: 'assistant', content: q8 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q9 = await askChatbot('Quel est le schéma de la table invoices?', conversationHistory, accessToken || undefined)
  if (q9) {
    conversationHistory.push({ role: 'user', content: 'Quel est le schéma de la table invoices?' })
    conversationHistory.push({ role: 'assistant', content: q9 })
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const q10 = await askChatbot('Quelles sont les tables disponibles?', conversationHistory, accessToken || undefined)
  if (q10) {
    conversationHistory.push({ role: 'user', content: 'Quelles sont les tables disponibles?' })
    conversationHistory.push({ role: 'assistant', content: q10 })
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Conversation terminée')
  console.log(`${'='.repeat(80)}\n`)
}

// Exécuter la conversation
runConversation().catch(console.error)

