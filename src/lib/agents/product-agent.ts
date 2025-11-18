import { mcpSupabaseTools } from '@/lib/ai/mcp-supabase-tools'
import { runAgentWithTools } from './utils'
import type { AgentRunOptions, AgentRunResult } from './types'

// Forcer l'agent Produits à n'utiliser QUE la recherche structurée
const allowedToolNames = ['search_table_data']
const productTools = mcpSupabaseTools.filter((tool) => allowedToolNames.includes(tool.name))

export async function runProductAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { parameters, organizationId } = options

  let focusText = ''
  if (parameters?.reference) {
    focusText += `\n- Concentre-toi sur la référence produit "${parameters.reference}".`
  }
  if (parameters?.product_name) {
    focusText += `\n- Produit recherché: ${parameters.product_name}.`
  }

  const systemPrompt = `Tu es l'agent PRODUITS. Ton rôle est de répondre aux questions liées aux produits pour l'organisation ${organizationId}.

Tables autorisées: products, invoice_items, invoices (pour retrouver les occurrences), suppliers.
RÈGLES CRITIQUES:
- N'exige JAMAIS l'organization_id à l'utilisateur; il est injecté automatiquement dans les outils.
- Utilise UNIQUEMENT "search_table_data" (ne pas appeler get_table_schema).
- Si la question contient une référence (ex: "221153"), fais une requête sur "products" avec un filtre ilike sur "reference".
- Limite le nombre de résultats à 5 maximum; si un seul produit correspond, retourne ses informations directement.

FORMAT DE RÉPONSE:
- Si correspondances: retourne nom, description, unité, prix HT, taux/code TVA, fournisseur (si disponible), statut (actif).
- Si aucune donnée: indique clairement qu'aucun produit ne correspond à la référence, et propose la vérification de l'orthographe.

Fournis des réponses concises, structurées, et indique les montants HT/TVA si pertinents.
Si aucune donnée n'est trouvée, informe clairement l'utilisateur et propose des pistes (ex: vérifier la référence).
${focusText}`

  return runAgentWithTools({
    ...options,
    systemPrompt,
    tools: productTools,
    maxIterations: options.maxIterations ?? 3,
    agentName: 'produits',
  })
}

