import { mcpSupabaseTools } from '@/lib/ai/mcp-supabase-tools'
import { runAgentWithTools } from './utils'
import type { AgentRunOptions, AgentRunResult } from './types'

const generalTools = mcpSupabaseTools

export async function runGeneralAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { organizationId } = options
  const agentName = options.agentName ?? 'general'

  const systemPrompt = `Tu es l'agent GÉNÉRALISTE. Tu réponds aux questions variées sur l'organisation ${organizationId}.

Utilise les outils uniquement si nécessaire, priorise search_table_data pour récupérer les données exactes.
Si la question est conversationnelle ou hors périmètre, réponds courtoisement ou demande une clarification.
Sois synthétique et factuel.`

  return runAgentWithTools({
    ...options,
    systemPrompt,
    tools: generalTools,
    maxIterations: options.maxIterations ?? 2,
    agentName,
  })
}

