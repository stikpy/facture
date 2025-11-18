'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../providers'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useRouter } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  sources?: Array<{
    invoice_id: string
    invoice_number?: string
    supplier_name?: string
    similarity?: number
  }>
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant comptable. Je peux vous aider à comprendre vos factures, produits, fournisseurs et données comptables. Posez-moi une question !',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<{
    stage: string
    tool?: string
    iteration?: number
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Transforme les URLs en liens cliquables
  const renderWithLinks = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g)
    return parts.map((part, idx) => {
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all"
          >
            {part}
          </a>
        )
      }
      return <span key={idx}>{part}</span>
    })
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (iso?: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const formatFullDateTime = (iso?: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return ''
    }
  }

  const formatDateKey = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const formatDateLabel = (iso?: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setProcessingStatus({ stage: 'Traitement en cours...' })

    try {
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))

      const response = await fetch('/api/chat?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_history: conversationHistory,
        }),
      })

      const contentType = response.headers.get('content-type') || ''

      if (!response.ok && !contentType.includes('text/event-stream')) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.details || `Erreur ${response.status}: ${response.statusText}`)
      }

      if (contentType.includes('text/event-stream') && response.body) {
        // Streaming SSE
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const newMsgIndex = messages.length + 1 // after pushing userMessage
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            sources: [],
          },
        ])

        const commitContent = (delta: string) => {
          setMessages(prev => {
            const next = [...prev]
            const msg = { ...next[newMsgIndex] }
            msg.content = (msg.content || '') + delta
            next[newMsgIndex] = msg
            return next
          })
        }
        const setSources = (sources: any[]) => {
          setMessages(prev => {
            const next = [...prev]
            const msg = { ...next[newMsgIndex] }
            msg.sources = sources as any
            next[newMsgIndex] = msg
            return next
          })
        }

        let shouldStop = false
        while (!shouldStop) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const part of parts) {
            const lines = part.split('\n')
            let event: string | null = null
            let data = ''
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                event = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                data += line.slice(6)
              }
            }
            if (!event) {
              // chunk de texte par défaut
              commitContent(data)
            } else if (event === 'status') {
              setProcessingStatus({ stage: data })
            } else if (event === 'classification') {
              // optionnel: afficher rien
            } else if (event === 'sources') {
              try {
                setSources(JSON.parse(data))
              } catch {
                // ignore
              }
            } else if (event === 'error') {
              throw new Error(data || 'Erreur de streaming')
            } else if (event === 'done') {
              // fin du stream coté serveur: on arrête la lecture immédiatement
              try { await reader.cancel() } catch {}
              shouldStop = true
              break
            }
          }
        }
        setProcessingStatus(null)
      } else {
        // Fallback JSON
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response || 'Désolé, je n\'ai pas pu générer de réponse.',
          timestamp: new Date().toISOString(),
          sources: data.sources || [],
        }
        setMessages(prev => [...prev, assistantMessage])
        setProcessingStatus(null)
      }
    } catch (error: any) {
      console.error('Erreur:', error)
      setProcessingStatus(null)
      const errorMessage: Message = {
        role: 'assistant',
        content: `Désolé, une erreur est survenue: ${error.message || 'Erreur inconnue'}. Veuillez réessayer. Si le problème persiste, assurez-vous que la migration de vectorisation a été appliquée et que les factures ont été vectorisées.`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      setProcessingStatus(null)
      inputRef.current?.focus()
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Assistant Comptable</h1>
        <p className="text-sm text-gray-600 mt-1">
          Posez-moi des questions sur vos factures, produits, fournisseurs et données comptables
        </p>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message, index) => {
          const prev = index > 0 ? messages[index - 1] : null
          const showDateSeparator =
            !!message.timestamp &&
            formatDateKey(message.timestamp) !== formatDateKey(prev?.timestamp)
          return (
            <div key={index}>
              {showDateSeparator && (
                <div className="flex items-center my-2">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="mx-2 text-xs text-gray-500 bg-white px-2">
                    {formatDateLabel(message.timestamp)}
                  </span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
              )}
              <div
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {renderWithLinks(message.content)}
                  </div>
                  {message.timestamp && (
                    <div
                      className={`mt-1 text-[11px] ${
                        message.role === 'user' ? 'text-white/70' : 'text-gray-500'
                      }`}
                      title={formatFullDateTime(message.timestamp)}
                    >
                      {formatTime(message.timestamp)}
                    </div>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-300 text-xs">
                      <div className="font-semibold mb-1">Sources:</div>
                      {message.sources.map((source, idx) => (
                        <div key={idx} className="text-gray-600">
                          • Facture {source.invoice_number || 'N/A'} - {source.supplier_name || 'N/A'}
                          {source.similarity && (
                            <span className="ml-2 text-gray-500">
                              ({Math.round(source.similarity * 100)}% de similarité)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-4 py-3 shadow-sm max-w-[80%]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <LoadingSpinner />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-blue-700">Réflexion en cours...</span>
                  </div>
                  {processingStatus && (
                    <div className="text-sm text-blue-600 mt-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                        <span>{processingStatus.stage}</span>
                      </div>
                      {processingStatus.tool && (
                        <div className="text-xs text-blue-500 mt-1 ml-3.5">
                          Utilisation de l'outil: {processingStatus.tool}
                        </div>
                      )}
                      {processingStatus.iteration && (
                        <div className="text-xs text-blue-500 mt-1 ml-3.5">
                          Itération {processingStatus.iteration}/10
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          placeholder="Posez votre question..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={1}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Envoyer
        </button>
      </form>
    </div>
  )
}

