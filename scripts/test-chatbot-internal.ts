/**
 * Test direct du chatbot en appelant les fonctions internes
 * Bypass l'authentification HTTP en utilisant directement Supabase admin
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { ChatOpenAI } from '@langchain/openai'
import { OpenAIEmbeddings } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { databaseTools } from '../src/lib/ai/database-tools'

// Charger les variables d'environnement
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Simule la logique du chatbot directement
 */
async function askChatbotDirect(message: string, conversationHistory: any[] = []) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`💬 Question: ${message}`)
  if (conversationHistory.length > 0) {
    console.log(`📜 Historique: ${conversationHistory.length} messages précédents`)
  }
  console.log(`${'='.repeat(80)}\n`)

  try {
    // Récupérer un utilisateur et son organisation
    const { data: users } = await supabase.auth.admin.listUsers()
    if (!users || users.users.length === 0) {
      console.error('❌ Aucun utilisateur trouvé')
      return null
    }

    const testUser = users.users[0]
    console.log(`👤 Utilisateur: ${testUser.email || testUser.id}`)

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', testUser.id)
      .single()

    if (!membership) {
      console.error('❌ Aucune organisation trouvée')
      return null
    }

    console.log(`🏢 Organisation: ${membership.organization_id}`)

    // Utiliser la clé API appropriée
    const PRIMARY_ORG_ID = '0c7de2b1-1550-4569-9bed-8544ae4d3651'
    const apiKey = membership.organization_id !== PRIMARY_ORG_ID
      ? (process.env.OPENAI_API_KEY_OTHER_ORGS || OPENAI_API_KEY)
      : OPENAI_API_KEY

    // Générer l'embedding de la question
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: 'text-embedding-3-small',
    })

    const queryEmbedding = await embeddings.embedQuery(message)

    // Rechercher les documents similaires (simplifié pour le test)
    let similarDocs: any[] = []
    try {
      const { data: rpcDocs } = await supabase.rpc('match_document_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5,
        filter_organization_id: membership.organization_id,
      })
      if (rpcDocs) {
        similarDocs = rpcDocs
      }
    } catch (err) {
      console.warn('⚠️  Recherche vectorielle non disponible, utilisation du contexte direct')
    }

    // Construire le contexte (simplifié)
    let context = ''
    if (similarDocs.length > 0) {
      context = similarDocs.map((doc: any) => doc.content).join('\n\n')
    }

    // Créer le LLM avec les outils
    const llm = new ChatOpenAI({
      modelName: 'gpt-5-mini',
      openAIApiKey: apiKey,
    })

    const llmWithTools = llm.bindTools(databaseTools)

    // Construire les messages
    const systemPrompt = `Vous êtes un assistant comptable intelligent pour l'application Facture AI.
Vous aidez les utilisateurs à comprendre leurs factures, produits, fournisseurs et données comptables.

INFORMATIONS IMPORTANTES:
- L'organization_id est: ${membership.organization_id}
- Vous DEVEZ toujours utiliser cet organization_id dans vos requêtes aux outils
- Ne demandez JAMAIS l'organization_id à l'utilisateur, vous l'avez déjà

RÈGLES IMPORTANTES:
- Répondez toujours en français
- Basez vos réponses sur le contexte fourni
- Si vous ne trouvez pas d'information dans le contexte, UTILISEZ LES OUTILS DISPONIBLES pour rechercher dans la base de données
- Vous avez accès à des outils pour explorer la base de données:
  * list_database_tables: Liste toutes les tables disponibles
  * get_table_schema: Obtient le schéma d'une table (colonnes, types)
  * search_table_data: Recherche des données dans une table avec filtres (peut filtrer par date/mois)
  * IMPORTANT: Lorsque vous utilisez search_table_data, vous DEVEZ inclure organization_id: "${membership.organization_id}" dans les filtres
- Utilisez ces outils si le contexte fourni ne contient pas les informations nécessaires
- Ne demandez JAMAIS l'organization_id, vous l'avez déjà

Contexte des documents pertinents:
${context}`

    const langchainMessages = [
      new SystemMessage(systemPrompt),
    ]

    // Ajouter l'historique
    conversationHistory.forEach((msg: any) => {
      if (msg.role === 'user') {
        langchainMessages.push(new HumanMessage(msg.content))
      } else if (msg.role === 'assistant') {
        langchainMessages.push(new AIMessage(msg.content))
      }
    })

    // Ajouter la question actuelle
    langchainMessages.push(new HumanMessage(message))

    // Générer la réponse avec support des outils
    let responseContent = ''
    let finalResponse: any = null
    const maxIterations = 10
    let iteration = 0
    let lastToolResults: string[] = []

    while (iteration < maxIterations) {
      iteration++
      
      const response = await llmWithTools.invoke(langchainMessages)
      finalResponse = response

      const toolCalls = response.tool_calls || []
      
      if (toolCalls.length === 0) {
        if (typeof response === 'string') {
          responseContent = response
        } else if (response?.content) {
          responseContent = typeof response.content === 'string' 
            ? response.content 
            : String(response.content)
        }
        break
      }

      // Vérifier les boucles infinies
      if (iteration > 1 && lastToolResults.length > 0) {
        const sameResults = lastToolResults.every((result, idx) => {
          return result === toolCalls[idx]?.name
        })
        if (sameResults && toolCalls.length === lastToolResults.length) {
          console.warn('⚠️  Détection de boucle infinie, arrêt des itérations')
          if (finalResponse?.content) {
            responseContent = typeof finalResponse.content === 'string' 
              ? finalResponse.content 
              : String(finalResponse.content)
          }
          break
        }
      }

      // Exécuter les outils
      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall: any) => {
          const toolName = toolCall.name
          // Ajouter automatiquement organization_id si l'outil le nécessite
          let toolArgs = { ...toolCall.args }
          if (toolName === 'search_table_data' && !toolArgs.filters) {
            toolArgs.filters = { organization_id: membership.organization_id }
          } else if (toolName === 'search_table_data' && toolArgs.filters) {
            toolArgs.filters = { ...toolArgs.filters, organization_id: membership.organization_id }
          }
          
          const tool = databaseTools.find(t => t.name === toolName)
          
          if (!tool) {
            return `Outil "${toolName}" non trouvé`
          }

          try {
            const result = await (tool as any).invoke(toolArgs)
            return String(result)
          } catch (error: any) {
            return `Erreur lors de l'exécution de l'outil "${toolName}": ${error.message}`
          }
        })
      )

      lastToolResults = toolCalls.map((tc: any) => tc.name)

      langchainMessages.push(response)
      
      toolCalls.forEach((toolCall: any, index: number) => {
        langchainMessages.push(
          new ToolMessage({
            content: String(toolResults[index]),
            tool_call_id: toolCall.id,
          })
        )
      })
    }

    if (!responseContent && finalResponse) {
      responseContent = typeof finalResponse.content === 'string' 
        ? finalResponse.content 
        : String(finalResponse.content)
    }

    console.log(`🤖 Réponse:`)
    console.log(responseContent)
    console.log(`\n${'─'.repeat(80)}\n`)

    return responseContent
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
    return null
  }
}

/**
 * Tests progressifs
 */
async function runTests() {
  console.log('🚀 Démarrage des tests directs du chatbot\n')

  const conversationHistory: any[] = []

  // Test spécifique: dépenses d'octobre
  console.log('📌 TEST: Dépenses en octobre\n')
  const r1 = await askChatbotDirect('Combien de dépenses en octobre?', conversationHistory)
  if (r1) {
    conversationHistory.push({ role: 'user', content: 'Combien de dépenses en octobre?' })
    conversationHistory.push({ role: 'assistant', content: r1 })
  }

  // Questions utilisant les outils MCP
  console.log('\n📌 PHASE 3: Questions nécessitant les outils MCP\n')
  await askChatbotDirect('Quelles sont les tables disponibles?', conversationHistory)
  await askChatbotDirect('Quel est le schéma de la table invoices?', conversationHistory)

  console.log(`\n${'='.repeat(80)}`)
  console.log('✅ Tests terminés')
  console.log(`${'='.repeat(80)}\n`)
}

runTests().catch(console.error)

