export type AgentTarget = 'products' | 'invoices' | 'stats' | 'general'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface OrchestratorResult {
  target: AgentTarget
  confidence: number
  reason: string
  parameters?: Record<string, any>
}

export interface AgentRunOptions {
  message: string
  conversationHistory: ConversationTurn[]
  apiKey: string
  organizationId: string
  context?: string
  parameters?: Record<string, any>
  similarDocs?: any[]
  maxIterations?: number
  agentName?: string
}

export interface AgentRunResult {
  response: string
  sources: Array<{ invoice_id: string; metadata: any }>
}



