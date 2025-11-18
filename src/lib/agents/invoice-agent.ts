import { mcpSupabaseTools } from '@/lib/ai/mcp-supabase-tools'
import { runAgentWithTools } from './utils'
import type { AgentRunOptions, AgentRunResult } from './types'

const allowedToolNames = ['search_table_data']
const invoiceTools = mcpSupabaseTools.filter((tool) => allowedToolNames.includes(tool.name))

function extractReferenceFromMessage(message: string): string | null {
  const match = message.match(/\b\d{4,}\b/)
  return match ? match[0] : null
}

export async function runInvoiceAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { parameters = {}, organizationId, message } = options

  if (!parameters.reference) {
    const detected = extractReferenceFromMessage(message)
    if (detected) {
      parameters.reference = detected
    }
  }

  let focusText = ''
  if (parameters?.period) {
    focusText += `\n- Période demandée: ${parameters.period}.`
  }
  if (parameters?.supplier) {
    focusText += `\n- Fournisseur ciblé: ${parameters.supplier}.`
  }
  if (parameters?.invoice_status) {
    focusText += `\n- Statut de facture: ${parameters.invoice_status}.`
  }
  if (parameters?.reference) {
    focusText += `\n- Référence article à rechercher: ${parameters.reference}.`
  }

  const systemPrompt = `Tu es l'agent FACTURES. Tu réponds aux questions concernant les factures de l'organisation ${organizationId}.

Tables autorisées: invoices, invoice_allocations, suppliers, products (pour retrouver les références présentes).
Tu DOIS utiliser l'outil search_table_data pour récupérer les factures correspondant à la requête. 
Étapes obligatoires:
1. Identifier les filtres pertinents (référence produit, période, fournisseur, statut).
2. Appeler une fois search_table_data avec ces filtres (limite 5 si la question demande un top 5).
3. Formater la réponse en listant numéro de facture, date, fournisseur, montants HT/TTC.
N'utilise pas get_table_schema sauf si les colonnes sont inconnues, car elles sont déjà documentées.
Quand tu résumes des montants, indique HT et TTC si disponibles.
Sois précis sur la période analysée et signale si les données sont incomplètes.
${focusText}`

  return runAgentWithTools({
    ...options,
    systemPrompt,
    tools: invoiceTools,
    maxIterations: options.maxIterations ?? 3,
    agentName: 'factures',
  })
}

