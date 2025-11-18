import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { AgentRunOptions, AgentRunResult, ConversationTurn } from './types'

function buildHistoryMessages(history: ConversationTurn[], maxMessages = 6) {
  const trimmed = history.slice(-maxMessages)
  return trimmed.map((msg) => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content)
    }
    return new AIMessage(msg.content)
  })
}

export async function runAgentWithTools(
  options: AgentRunOptions & { systemPrompt: string; tools: DynamicStructuredTool[] }
): Promise<AgentRunResult> {
  const {
    message,
    conversationHistory,
    apiKey,
    organizationId,
    context,
    parameters,
    similarDocs = [],
    maxIterations = 2,
    tools,
    systemPrompt,
    agentName = 'general',
  } = options

  const messageSnippet = message.slice(0, 160).replace(/\s+/g, ' ')
  console.log(`🤖 [${agentName}] START | org=${organizationId} | msg="${messageSnippet}${message.length > 160 ? '…' : ''}" | params=${JSON.stringify(parameters || {})}`)

  const finalContext = context ? context.trim().slice(0, 14000) : ''
  const paramDescription = parameters ? `\n\nParamètres fournis par l'orchestrateur:\n${JSON.stringify(parameters, null, 2)}` : ''
  const contextSection = finalContext ? `\n\nContexte disponible:\n${finalContext}` : ''

  // Construire les options du modèle sans forcer la température.
  // Certains modèles ne supportent pas de température autre que la valeur par défaut.
  const llmOptions: Record<string, any> = {
    modelName: process.env.DEFAULT_AGENT_MODEL || 'gpt-5-mini',
    openAIApiKey: apiKey,
    timeout: Number(process.env.DEFAULT_AGENT_TIMEOUT_MS || 12000),
  }
  const envTemp = process.env.DEFAULT_AGENT_TEMPERATURE
  if (envTemp !== undefined && envTemp !== '' && envTemp.toLowerCase() !== 'default') {
    const parsed = Number(envTemp)
    if (!Number.isNaN(parsed)) {
      llmOptions.temperature = parsed
    }
  }
  const llm = new ChatOpenAI(llmOptions as any)

  const llmWithTools = llm.bindTools(tools)

  const messages = [
    new SystemMessage(`${systemPrompt}${paramDescription}${contextSection}`),
    ...buildHistoryMessages(conversationHistory),
    new HumanMessage(message),
  ]

  let responseContent = ''
  let finalResponse: any = null
  let iteration = 0
  const toolCallHistory: Array<{ names: string[]; args: string[] }> = []
  const agentStart = Date.now()

  while (iteration < maxIterations) {
    iteration++

    const response = await llmWithTools.invoke(messages)
    finalResponse = response
    const toolCalls = response.tool_calls || []

    if (toolCalls.length === 0) {
      if (typeof response?.content === 'string') {
        responseContent = response.content
      } else if (Array.isArray(response?.content)) {
        responseContent = response.content
          .map((c: any) => (typeof c === 'string' ? c : c?.text || c?.content || ''))
          .join('')
      } else if (response?.text) {
        responseContent = response.text
      } else {
        responseContent = String(response?.content ?? '')
      }
      break
    }

    const currentToolNames = toolCalls.map((tc: any) => tc.name).sort()
    const currentToolArgs = toolCalls.map((tc: any) => JSON.stringify(tc.args || {})).sort()

    if (iteration > 2 && toolCallHistory.length >= 2) {
      const lastTwo = toolCallHistory.slice(-2)
      const isLoop = lastTwo.every((history) => {
        const historyNames = [...history.names].sort()
        const historyArgs = [...history.args].sort()
        return (
          JSON.stringify(historyNames) === JSON.stringify(currentToolNames) &&
          JSON.stringify(historyArgs) === JSON.stringify(currentToolArgs)
        )
      })

      if (isLoop) {
        console.warn(`⚠️  [${agentName}] Boucle détectée après ${iteration} itérations`)
        if (finalResponse?.content) {
          responseContent =
            typeof finalResponse.content === 'string' ? finalResponse.content : String(finalResponse.content)
        } else {
          responseContent =
            "Je ne parviens pas à récupérer ces informations précisément. Pouvez-vous reformuler ou préciser la question ?"
        }
        break
      }
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const toolName = toolCall.name
        let toolArgs = { ...toolCall.args }
        if (toolName === 'search_table_data') {
          if (!toolArgs.filters) {
            toolArgs.filters = { organization_id: organizationId }
          } else {
            toolArgs.filters = { ...toolArgs.filters, organization_id: organizationId }
          }
        }

        const tool = tools.find((t) => t.name === toolName)
        if (!tool) {
          return `Outil "${toolName}" introuvable pour l'agent ${agentName}`
        }

        try {
          const start = Date.now()
          const result = await (tool as any).invoke(toolArgs)
          const duration = Date.now() - start
          console.log(`🛠️  [${agentName}] Outil "${toolName}" exécuté en ${duration} ms`)
          return String(result)
        } catch (error: any) {
          console.error(`🛠️  [${agentName}] Erreur outil "${toolName}":`, error)
          return `Erreur lors de l'exécution de l'outil "${toolName}": ${error.message}`
        }
      })
    )

    toolCallHistory.push({
      names: toolCalls.map((tc: any) => tc.name),
      args: toolCalls.map((tc: any) => JSON.stringify(tc.args || {})),
    })
    if (toolCallHistory.length > 3) {
      toolCallHistory.shift()
    }

    messages.push(response)
    toolCalls.forEach((toolCall: any, index: number) => {
      messages.push(
        new ToolMessage({
          content: String(toolResults[index]),
          tool_call_id: toolCall.id,
        })
      )
    })
  }

  if (!responseContent && finalResponse) {
    responseContent =
      typeof finalResponse.content === 'string' ? finalResponse.content : String(finalResponse.content ?? '')
  }

  if (!responseContent) {
    responseContent =
      "Je ne dispose pas des informations nécessaires pour répondre précisément. Pouvez-vous reformuler votre question ?"
  }

  console.log(`✅ [${agentName}] DONE in ${Date.now() - agentStart} ms`)

  return {
    response: responseContent,
    sources: similarDocs.map((doc: any) => ({
      invoice_id: doc.invoice_id,
      metadata: doc.metadata,
    })),
  }
}

