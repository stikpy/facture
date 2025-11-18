import { supabaseAdmin } from './supabase'

// Prix OpenAI GPT-5 (par 1M tokens)
const INPUT_COST_PER_MILLION = 2.50
const OUTPUT_COST_PER_MILLION = 10.00
const MARKUP_RATE = 0.05 // 5% de majoration

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface TokenUsageRecord {
  organization_id: string
  invoice_id?: string
  model_name?: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  operation_type?: 'extraction' | 'classification' | 'embedding'
}

/**
 * Calcule le coût en USD basé sur les tokens
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string = 'gpt-5-mini'
): {
  input_cost: number
  output_cost: number
  total_cost: number
  total_cost_marked_up: number
} {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION
  const totalCost = inputCost + outputCost
  const totalCostMarkedUp = totalCost * (1 + MARKUP_RATE)

  return {
    input_cost: Number(inputCost.toFixed(8)),
    output_cost: Number(outputCost.toFixed(8)),
    total_cost: Number(totalCost.toFixed(8)),
    total_cost_marked_up: Number(totalCostMarkedUp.toFixed(8)),
  }
}

/**
 * Enregistre la consommation de tokens en base de données
 */
export async function recordTokenUsage(record: TokenUsageRecord): Promise<void> {
  try {
    const { input_cost, output_cost, total_cost, total_cost_marked_up } = calculateTokenCost(
      record.input_tokens,
      record.output_tokens,
      record.model_name
    )

    const { error } = await supabaseAdmin
      .from('token_usage')
      .insert({
        organization_id: record.organization_id,
        invoice_id: record.invoice_id || null,
        model_name: record.model_name || 'gpt-5-mini',
        input_tokens: record.input_tokens,
        output_tokens: record.output_tokens,
        total_tokens: record.total_tokens,
        input_cost,
        output_cost,
        total_cost,
        total_cost_marked_up,
        operation_type: record.operation_type || 'extraction',
      } as any)

    if (error) {
      console.error('❌ [TOKEN-USAGE] Erreur lors de l\'enregistrement:', error)
      // Ne pas faire échouer le traitement si l'enregistrement échoue
    } else {
      console.log(`✅ [TOKEN-USAGE] Enregistré: ${record.total_tokens} tokens (${total_cost_marked_up.toFixed(4)} $)` +
        ` pour org ${record.organization_id}`)
    }
  } catch (error) {
    console.error('❌ [TOKEN-USAGE] Exception lors de l\'enregistrement:', error)
    // Ne pas faire échouer le traitement
  }
}

/**
 * Extrait les tokens depuis les métadonnées de réponse LangChain
 */
export function extractTokenUsageFromResponse(response: any): TokenUsage | null {
  try {
    // LangChain peut stocker les tokens à différents niveaux
    // 1. Dans response_metadata (pour les réponses directes)
    // 2. Dans answer.response_metadata (pour les chaînes de récupération)
    // 3. Dans usage (format OpenAI direct)
    
    let metadata: any = {}
    
    if (response?.response_metadata) {
      metadata = response.response_metadata
    } else if (response?.answer?.response_metadata) {
      metadata = response.answer.response_metadata
    } else if (response?.usage) {
      metadata = response.usage
    } else if (response?.llm_output?.token_usage) {
      metadata = response.llm_output.token_usage
    }
    
    // Format OpenAI standard
    const inputTokens = metadata.prompt_tokens || metadata.input_tokens || 0
    const outputTokens = metadata.completion_tokens || metadata.output_tokens || 0
    const totalTokens = metadata.total_tokens || (inputTokens + outputTokens) || 0

    if (totalTokens === 0) {
      // Si aucun token trouvé, essayer de chercher plus profondément
      const deepSearch = (obj: any, depth = 0): any => {
        if (depth > 3) return null
        if (!obj || typeof obj !== 'object') return null
        
        if (obj.prompt_tokens || obj.input_tokens || obj.completion_tokens || obj.output_tokens) {
          return obj
        }
        
        for (const key in obj) {
          if (key === 'response_metadata' || key === 'usage' || key === 'token_usage' || key === 'llm_output') {
            const found = deepSearch(obj[key], depth + 1)
            if (found) return found
          }
        }
        return null
      }
      
      const found = deepSearch(response)
      if (found) {
        const input = found.prompt_tokens || found.input_tokens || 0
        const output = found.completion_tokens || found.output_tokens || 0
        const total = found.total_tokens || (input + output) || 0
        
        if (total > 0) {
          return {
            input_tokens: input,
            output_tokens: output,
            total_tokens: total,
          }
        }
      }
      
      return null
    }

    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    }
  } catch (error) {
    console.warn('⚠️ [TOKEN-USAGE] Impossible d\'extraire les tokens:', error)
    return null
  }
}

