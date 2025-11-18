import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ConversationTurn, OrchestratorResult } from './types'

export async function rewriteQuery(options: { message: string; apiKey: string }): Promise<string> {
  const { message, apiKey } = options
  const model = new ChatOpenAI({
    // Modèle plus léger pour réduire la latence
    modelName: process.env.ORCHESTRATOR_REWRITE_MODEL || 'gpt-5-mini',
    openAIApiKey: apiKey,
    timeout: 2500,
  })
  const system = new SystemMessage(
    `Réécris la question de l'utilisateur de manière concise et explicite sans changer son sens.
- Conserve les références numériques telles quelles (ex: 221153).
- Ajoute les mots manquants évidents (produit/facture/période) si cela clarifie.
- Répond par UNE SEULE PHRASE courte.`
  )
  try {
    const res = await model.invoke([system, new HumanMessage(message)])
    const out =
      typeof res?.content === 'string'
        ? res.content.trim()
        : Array.isArray(res?.content)
        ? res.content.map((c: any) => (typeof c === 'string' ? c : c?.text || c?.content || '')).join('').trim()
        : String(res?.content ?? '').trim()
    return out || message
  } catch {
    return message
  }
}

export async function classifyIntent(options: {
  message: string
  conversationHistory: ConversationTurn[]
  apiKey: string
  organizationId: string
}): Promise<OrchestratorResult> {
  const { message, conversationHistory, apiKey, organizationId } = options

  const historySnippet = conversationHistory
    .slice(-4)
    .map((msg) => `${msg.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
    .join('\n')

  const model = new ChatOpenAI({
    // Modèle plus léger et timeout réduit
    modelName: process.env.ORCHESTRATOR_MODEL || 'gpt-5-mini',
    openAIApiKey: apiKey,
    timeout: 5000,
  })

  const systemPrompt = `Tu es l'agent ORCHESTRATEUR. Ton objectif est de router chaque question vers un sous-agent spécialisé.

Agents disponibles:
- products: questions sur les produits, références, prix, fournisseurs, unités, TVA produit.
- invoices: questions sur les factures, montants, statuts, périodes, allocations.
- stats: analyses chiffrées globales (synthèses, comparaisons, agrégations).
- general: fallback générique si la question est conversationnelle ou ne correspond pas clairement à un agent.

Consignes:
- Analyse uniquement le message de l'utilisateur (et le contexte récent) pour choisir l'agent.
- Retourne TOUJOURS un JSON strict respectant le schéma fourni.
- Déduis les paramètres utiles (ex: reference produit, période temporelle, identifiant facture).
- Ne mentionne pas l'organisation directement mais rappelle que l'organization_id fourni est ${organizationId}.
`

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Historique récent:\n${historySnippet || 'Aucun'}\n\nQuestion:\n${message}\n\nRéponds UNIQUEMENT avec un JSON respectant ce schéma:\n{\n  "target": "products" | "invoices" | "stats" | "general",\n  "confidence": nombre entre 0 et 1,\n  "reason": "explication courte",\n  "parameters": { "clé": valeur, ... } (optionnel)\n}\nNe mets jamais de texte en dehors du JSON.`
    ),
  ])

  let rawContent = ''
  if (typeof response?.content === 'string') {
    rawContent = response.content
  } else if (Array.isArray(response?.content)) {
    rawContent = response.content
      .map((item: any) => (typeof item === 'string' ? item : item?.text || item?.content || ''))
      .join('')
  } else if (response?.text) {
    rawContent = response.text
  }

  rawContent = rawContent.trim()

  if (!rawContent) {
    return {
      target: 'general',
      confidence: 0.1,
      reason: 'Réponse vide du modèle',
    }
  }

  try {
    const parsed = JSON.parse(rawContent)
    const initialTarget = ['products', 'invoices', 'stats', 'general'].includes(parsed.target)
      ? parsed.target
      : 'general'
    const confidence = typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.3
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'Raison non fournie'
    const parameters: Record<string, any> =
      parsed.parameters && typeof parsed.parameters === 'object' ? { ...parsed.parameters } : {}

    const referenceMatch = message.match(/\b\d{4,}\b/)
    if (initialTarget === 'invoices' || reason.toLowerCase().includes('facture')) {
      if (referenceMatch && !parameters.reference) {
        parameters.reference = referenceMatch[0]
      }
    }

    const target = initialTarget

    return {
      target,
      confidence,
      reason,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    }
  } catch (error) {
    console.error('❌ Erreur de parsing JSON orchestrateur:', error, rawContent)
    return {
      target: 'general',
      confidence: 0.2,
      reason: 'JSON invalide, fallback sur agent général',
    }
  }
}

