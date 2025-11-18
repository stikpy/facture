import { NextRequest, NextResponse } from 'next/server'
import '@/lib/mcp/init'
import { createClient } from '@/utils/supabase/server'
import { OpenAIEmbeddings } from '@langchain/openai'
import { classifyIntent, rewriteQuery } from '@/lib/agents/orchestrator'
import { runProductAgent } from '@/lib/agents/product-agent'
import { runInvoiceAgent } from '@/lib/agents/invoice-agent'
import { runGeneralAgent } from '@/lib/agents/general-agent'
import type { ConversationTurn, OrchestratorResult } from '@/lib/agents/types'
import { Database } from '@/types/database'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}

function encodeSSE(event: string | null, data: any) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  const evt = event ? `event: ${event}\n` : ''
  return new TextEncoder().encode(`${evt}data: ${payload}\n\n`)
}

function parseLimitFromMessage(message: string): number {
  const match = message.match(/(\d+)\s*(?:derni[eè]res?|premi[eè]res?)/i)
  if (match) {
    const value = parseInt(match[1], 10)
    if (!Number.isNaN(value) && value > 0) {
      return Math.min(value, 20)
    }
  }
  return 5
}

function formatEuro(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A'
  }
  return `${value.toFixed(2)} €`
}

function extractReferenceFromText(text: string): string | null {
  const ref = text.match(/\b\d{4,}\b/)
  return ref ? ref[0] : null
}

function extractReferenceFromHistory(history: ConversationTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    const ref = extractReferenceFromText(msg.content || '')
    if (ref) return ref
  }
  return null
}

function extractKeyword(text: string): string | null {
  const cleaned = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  // Stopwords étendus (évite "existe", "facture", "produit", etc.)
  const stop = new Set([
    'le','la','les','un','une','des','du','de','dans','sur','avec','pour','est','y','a','t','il',
    'ce','cet','cette','et','en','aux','au','que','qui','quoi','dont','ou','plus','autre','il','ya',
    'existe','exister','existes','existent','existe-t','t','il',
    'facture','factures','contenant','contient','contiennent','figure','figurer','figurent',
    'produit','produits'
  ])
  const tokens = cleaned.split(/[^a-z0-9]+/).filter(Boolean)
  // Parcourir à rebours pour privilégier le terme spécifique en fin de phrase (ex: "jambon")
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (t.length >= 3 && !stop.has(t) && !/^\d+$/.test(t)) return t
  }
  return null
}
function heuristicClassify(message: string): OrchestratorResult {
  const lower = message.toLowerCase()
  const refMatch = message.match(/\b\d{4,}\b/)
  const parameters: Record<string, any> = {}
  if (refMatch) parameters.reference = refMatch[0]

  if (lower.includes('facture')) {
    return { target: 'invoices', confidence: 0.6, reason: 'Heuristique: mot-clé facture', parameters }
  }
  if (lower.includes('produit') || lower.includes('référence') || lower.includes('reference')) {
    return { target: 'products', confidence: 0.6, reason: 'Heuristique: mot-clé produit/référence', parameters }
  }
  if (lower.includes('stat') || lower.includes('dépense') || lower.includes('depense')) {
    return { target: 'stats', confidence: 0.5, reason: 'Heuristique: mot-clé stats/dépense', parameters }
  }
  return { target: 'general', confidence: 0.4, reason: 'Heuristique: aucune correspondance claire', parameters }
}

async function fetchInvoicesByItemReference(
  supabase: SupabaseClient,
  organizationId: string,
  reference: string,
  limit = 5
) {
  // 1) Essayer la voie rapide via invoice_items + jointure invoices
  try {
    const { data, error } = await supabase
      .from('invoice_items' as any)
      .select(
        `
          invoice_id,
          reference,
          description,
          invoices!inner(
            id,
            organization_id,
            status,
            created_at,
            extracted_data,
            supplier: suppliers(display_name)
          )
        `
      )
      .ilike('reference', `%${reference}%`)
      .eq('invoices.organization_id', organizationId)
      .order('invoices.created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      const grouped = new Map<string, { inv: any; items: any[] }>()
      for (const row of data as any[]) {
        const inv = (row as any).invoices
        if (!grouped.has(inv.id)) grouped.set(inv.id, { inv, items: [] })
        grouped.get(inv.id)!.items.push({ reference: row.reference, description: row.description })
        if (grouped.size >= limit) break
      }
      const results = Array.from(grouped.values()).map(({ inv, items }) => ({
        id: inv.id,
        invoice_date: inv.extracted_data?.invoice_date || null,
        supplier: inv.supplier?.display_name || null,
        status: inv.status || null,
        extracted_data: inv.extracted_data || {},
        matches: items.map((m: any) => ({ reference: m.reference || null, description: m.description || null })),
      }))
      return results.slice(0, limit)
    }
  } catch {
    // Ignore et fallback
  }

  // 2) Fallback: scan des factures récentes et filtrage JSON côté serveur
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('invoices')
    .select(
      `
        id,
        organization_id,
        status,
        created_at,
        extracted_data,
        supplier: suppliers(display_name)
      `
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(150)

  if (error) {
    console.error('❌ Erreur Supabase (fetchInvoicesByItemReference):', error)
    return null
  }

  const results: {
    id: string
    invoice_date: string | null
    supplier: string | null
    status: string | null
    extracted_data: any
    matches: Array<{ reference: string | null; description: string | null }>
  }[] = []

  const refLower = reference.toLowerCase()
  for (const inv of data || []) {
    const ed = (inv as any).extracted_data || {}
    const items: any[] = Array.isArray(ed.items) ? ed.items : []
    const matched = items.filter((it) => {
      const ref = String(it.reference || '').toLowerCase()
      return refLower && ref.includes(refLower)
    })
    if (matched.length > 0) {
      results.push({
        id: inv.id,
        invoice_date: ed.invoice_date || null,
        supplier: (inv as any).supplier?.display_name || null,
        status: inv.status || null,
        extracted_data: ed,
        matches: matched.map((m) => ({
          reference: m.reference || null,
          description: m.description || null,
        })),
      })
    }
    if (results.length >= limit) {
      break
    }
  }

  return results
    .sort((a, b) => {
      const dateA = a.invoice_date ? new Date(a.invoice_date).getTime() : 0
      const dateB = b.invoice_date ? new Date(b.invoice_date).getTime() : 0
      return dateB - dateA
    })
    .slice(0, limit)
}

async function fetchInvoicesByKeyword(
  supabase: SupabaseClient,
  organizationId: string,
  keyword: string,
  limit = 5
) {
  // 1) Essayer via invoice_items.description ilike + jointure invoices
  try {
    const { data, error } = await supabase
      .from('invoice_items' as any)
      .select(
        `
          invoice_id,
          reference,
          description,
          invoices!inner(
            id,
            organization_id,
            status,
            created_at,
            extracted_data,
            supplier: suppliers(display_name)
          )
        `
      )
      .ilike('description', `%${keyword}%`)
      .eq('invoices.organization_id', organizationId)
      .order('invoices.created_at', { ascending: false })
      .limit(200)

    if (!error && data) {
      const grouped = new Map<string, { inv: any; items: any[] }>()
      for (const row of data as any[]) {
        const inv = (row as any).invoices
        if (!grouped.has(inv.id)) grouped.set(inv.id, { inv, items: [] })
        grouped.get(inv.id)!.items.push({ reference: row.reference, description: row.description })
        if (grouped.size >= limit) break
      }
      const results = Array.from(grouped.values()).map(({ inv, items }) => ({
        id: inv.id,
        invoice_date: inv.extracted_data?.invoice_date || null,
        supplier: inv.supplier?.display_name || null,
        status: inv.status || null,
        extracted_data: inv.extracted_data || {},
        items: items.map((i: any) => ({ reference: i.reference, description: i.description })),
      }))
      return results.slice(0, limit)
    }
  } catch {
    // ignore et fallback
  }

  // 2) Fallback: scan JSON des factures récentes
  const { data, error } = await supabase
    .from('invoices')
    .select(
      `
        id,
        organization_id,
        status,
        created_at,
        extracted_data,
        supplier: suppliers(display_name)
      `
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(150)

  if (error) {
    console.error('❌ Erreur Supabase (fetchInvoicesByKeyword):', error)
    return null
  }

  const kw = keyword.toLowerCase()
  const matches: {
    id: string
    invoice_date: string | null
    supplier: string | null
    status: string | null
    extracted_data: any
    items: Array<{ reference?: string; description?: string }>
  }[] = []

  for (const inv of data || []) {
    const ed = (inv as any).extracted_data || {}
    const items: any[] = Array.isArray(ed.items) ? ed.items : []
    const hit = items.filter((it) => String(it.description || '').toLowerCase().includes(kw))
    if (hit.length > 0) {
      matches.push({
        id: inv.id,
        invoice_date: ed.invoice_date || null,
        supplier: (inv as any).supplier?.display_name || null,
        status: inv.status || null,
        extracted_data: ed,
        items: hit.map((i) => ({ reference: i.reference, description: i.description })),
      })
    }
    if (matches.length >= limit) break
  }

  return matches
    .sort((a, b) => {
      const dateA = a.invoice_date ? new Date(a.invoice_date).getTime() : 0
      const dateB = b.invoice_date ? new Date(b.invoice_date).getTime() : 0
      return dateB - dateA
    })
    .slice(0, limit)
}

async function fetchProductsByReference(
  supabase: SupabaseClient,
  organizationId: string,
  reference: string,
  limit = 5
) {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
        id,
        reference,
        name,
        description,
        price,
        vat_rate,
        vat_code,
        unit,
        is_active,
        supplier_id,
        suppliers!inner(display_name,code)
      `
    )
    .eq('organization_id', organizationId)
    .ilike('reference', `%${reference}%`)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('❌ Erreur Supabase (fetchProductsByReference):', error)
    return null
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    reference: row.reference,
    name: row.name,
    description: row.description,
    price: row.price,
    vat_rate: row.vat_rate,
    vat_code: row.vat_code,
    unit: row.unit,
    is_active: row.is_active,
    supplier_name: row.suppliers?.display_name || null,
    supplier_code: row.suppliers?.code || null,
  }))
}

/**
 * API pour le chatbot RAG
 * POST /api/chat
 * Body: { message: string, conversation_history?: Array<{role: string, content: string}> }
 */
export async function POST(request: NextRequest) {
  try {
    const wantsStream =
      request.headers.get('accept')?.includes('text/event-stream') ||
      request.nextUrl.searchParams.get('stream') === '1'

    if (wantsStream) {
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const send = (event: string | null, data: any) => controller.enqueue(encodeSSE(event, data))
          try {
            controller.enqueue(encodeSSE('status', 'initialisation'))
            const supabase = await createClient()
            let { data: { user }, error: authError } = await supabase.auth.getUser()
            if (!user) {
              const authHeader = request.headers.get('authorization')
              if (authHeader) {
                const token = authHeader.replace('Bearer ', '')
                const authResult = await supabase.auth.getUser(token)
                user = authResult.data.user
                authError = authResult.error
              }
            }
            if (authError || !user) {
              send('error', { message: 'Non authentifié' })
              controller.close()
              return
            }
            const { data: membership } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', user.id)
              .single()
            if (!membership) {
              send('error', { message: 'Aucune organisation trouvée' })
              controller.close()
              return
            }
            const body = await request.json()
            const { message, conversation_history = [] } = body
            if (!message || typeof message !== 'string') {
              send('error', { message: 'Message requis' })
              controller.close()
              return
            }

            const PRIMARY_ORG_ID = '0c7de2b1-1550-4569-9bed-8544ae4d3651'
            const apiKey = membership.organization_id !== PRIMARY_ORG_ID
              ? (process.env.OPENAI_API_KEY_OTHER_ORGS || process.env.OPENAI_API_KEY)
              : process.env.OPENAI_API_KEY
            if (!apiKey) {
              send('error', { message: 'Clé API OpenAI manquante' })
              controller.close()
              return
            }

            // Lancer embeddings en tâche de fond
            const embeddingsWork = (async () => {
              try {
                const embeddings = new OpenAIEmbeddings({
                  openAIApiKey: apiKey,
                  modelName: 'text-embedding-3-small',
                })
                const queryEmbedding = await embeddings.embedQuery(message)
                const { data: rpcDocs } = await supabase.rpc('match_document_embeddings', {
                  query_embedding: queryEmbedding,
                  match_threshold: 0.78,
                  match_count: 3,
                  filter_organization_id: membership.organization_id,
                })
                return Array.isArray(rpcDocs) ? rpcDocs : []
              } catch {
                return []
              }
            })()

            const conversationHistory: ConversationTurn[] = (conversation_history || [])
              .filter((msg: any) => msg?.role && msg?.content)
              .map((msg: any) => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: String(msg.content),
              }))

            // Réécriture + classification
            send('status', 'orchestration')
            const rewritten = await rewriteQuery({ message, apiKey })
            let classification: OrchestratorResult
            try {
              classification = (await Promise.race([
                classifyIntent({
                  message: rewritten,
                  conversationHistory,
                  apiKey,
                  organizationId: membership.organization_id,
                }),
                new Promise<OrchestratorResult>((_, reject) =>
                  setTimeout(() => reject(new Error('orchestrator_timeout')), 5000)
                ),
              ])) as OrchestratorResult
              send('classification', classification)
            } catch (err: any) {
              classification = heuristicClassify(message)
              send('classification', classification)
            }

            // Contexte vectoriel non bloquant (<=1200ms)
            let similarDocs: any[] = []
            let context = ''
            try {
              const docs = await Promise.race([
                embeddingsWork,
                new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 1200)),
              ])
              similarDocs = docs
              if (docs.length > 0) {
                context = docs.map((d: any) => d.content).join('\n\n')
                send('context', { count: docs.length })
              }
            } catch {
              // ignore
            }

            // Fast paths
            const agentOptions = {
              message: rewritten,
              conversationHistory,
              apiKey,
              organizationId: membership.organization_id,
              context,
              parameters: classification.parameters,
              similarDocs,
            }
            let agentResult: { response: string; sources: any[] } | undefined
            const limit = parseLimitFromMessage(message)

            if (
              classification.target === 'invoices' &&
              classification.parameters?.reference &&
              typeof classification.parameters.reference === 'string'
            ) {
              send('status', 'recherche_factures_reference')
              const invoices = await fetchInvoicesByItemReference(
                supabase,
                membership.organization_id,
                classification.parameters.reference,
                limit
              )
              if (invoices && invoices.length > 0) {
                const origin =
                  request.headers.get('origin') ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  'http://localhost:3000'
                const lines = invoices.map((inv, index) => {
                  const totalHT = inv.extracted_data?.subtotal ?? null
                  const totalTTC = inv.extracted_data?.total_amount ?? null
                  const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Date inconnue'
                  const link = `${origin}/invoices/${inv.id}`
                  const matchList = inv.matches
                    .map((match) => `• ${match.reference ?? 'N/A'} – ${match.description ?? 'Description manquante'}`)
                    .join('\n    ')
                  return `${index + 1}. Facture du ${date} (${inv.status ?? 'statut indisponible'}) – ${
                    inv.supplier ?? 'Fournisseur inconnu'
                  }\n   Montant HT: ${formatEuro(totalHT)} | Montant TTC: ${formatEuro(totalTTC)}\n   Lien: ${link}\n   Articles correspondants:\n    ${matchList}`
                })
                const responseText = `Voici les ${invoices.length} dernières factures contenant la référence ${classification.parameters.reference} :\n\n${lines.join(
                  '\n\n'
                )}`
                agentResult = {
                  response: responseText,
                  sources: invoices.map((inv) => ({
                    invoice_id: inv.id,
                    metadata: {
                      supplier: inv.supplier,
                      invoice_date: inv.invoice_date,
                      status: inv.status,
                      reference: classification.parameters?.reference,
                    },
                  })),
                }
              }
            }

            if (
              !agentResult &&
              classification.target === 'products' &&
              classification.parameters?.reference &&
              typeof classification.parameters.reference === 'string'
            ) {
              send('status', 'recherche_produits_reference')
              const products = await fetchProductsByReference(
                supabase,
                membership.organization_id,
                classification.parameters.reference,
                limit
              )
              if (products && products.length > 0) {
                const lines = products.map((p, i) => {
                  const price = typeof p.price === 'number' ? `${p.price.toFixed(2)} €` : 'N/A'
                  const tva = p.vat_rate != null ? `${p.vat_rate}%` : p.vat_code || '—'
                  const unit = p.unit || '—'
                  const supplier = p.supplier_name ? `${p.supplier_name}${p.supplier_code ? ` (${p.supplier_code})` : ''}` : '—'
                  return `${i + 1}. ${p.reference} — ${p.name || 'Nom inconnu'}\n   Fournisseur: ${supplier} | Prix HT: ${price} | TVA: ${tva} | Unité: ${unit}\n   ${p.description || ''}`.trim()
                })
                agentResult = {
                  response: `Résultat(s) pour la référence ${classification.parameters.reference}:\n\n${lines.join('\n\n')}`,
                  sources: [],
                }
              }
            }

            if (
              !agentResult &&
              classification.target === 'invoices' &&
              !(classification.parameters as any)?.reference
            ) {
              const kw =
                extractKeyword(rewritten) || extractKeyword(message) || extractKeyword((conversationHistory.at(-1)?.content) || '')
              if (kw) {
                send('status', `recherche_factures_motcle:${kw}`)
                const invoicesByKw = await fetchInvoicesByKeyword(
                  supabase,
                  membership.organization_id,
                  kw,
                  limit
                )
                if (invoicesByKw && invoicesByKw.length > 0) {
                  const origin =
                    request.headers.get('origin') ||
                    process.env.NEXT_PUBLIC_APP_URL ||
                    'http://localhost:3000'
                  const out = invoicesByKw.map((inv, idx) => {
                    const totalHT = inv.extracted_data?.subtotal ?? null
                    const totalTTC = inv.extracted_data?.total_amount ?? null
                    const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Date inconnue'
                    const link = `${origin}/invoices/${inv.id}`
                    const itemList = inv.items
                      .map((it) => `• ${it.reference || '—'} – ${it.description || 'Description manquante'}`)
                      .join('\n    ')
                    return `${idx + 1}. Facture du ${date} (${inv.status ?? 'statut indisponible'}) – ${inv.supplier ?? 'Fournisseur inconnu'}\n   Montant HT: ${formatEuro(totalHT)} | Montant TTC: ${formatEuro(totalTTC)}\n   Lien: ${link}\n   Articles correspondants:\n    ${itemList}`
                  })
                  agentResult = {
                    response: `Voici les ${invoicesByKw.length} factures contenant "${kw}" :\n\n${out.join('\n\n')}`,
                    sources: invoicesByKw.map((inv) => ({
                      invoice_id: inv.id,
                      metadata: { invoice_date: inv.invoice_date, supplier: inv.supplier, keyword: kw },
                    })),
                  }
                }
              }
            }

            if (!agentResult) {
              send('status', `agent:${classification.target}`)
              agentResult =
                classification.target === 'products'
                  ? await runProductAgent(agentOptions)
                  : classification.target === 'invoices'
                  ? await runInvoiceAgent(agentOptions)
                  : classification.target === 'stats'
                  ? await runGeneralAgent({ ...agentOptions, agentName: 'stats' })
                  : await runGeneralAgent(agentOptions)
            }

            // Stream de la réponse finale (caractère par caractère pour UX)
            send('status', 'streaming')
            const text = agentResult.response || ''
            const encoder = new TextEncoder()
            let buffer = ''
            for (const ch of text) {
              buffer += ch
              if (buffer.length >= 64 || ch === '\n') {
                controller.enqueue(encodeSSE(null, buffer))
                buffer = ''
              }
            }
            if (buffer) {
              controller.enqueue(encodeSSE(null, buffer))
            }
            send('sources', agentResult.sources || [])
            send('done', 'ok')
            controller.close()
          } catch (err: any) {
            controller.enqueue(encodeSSE('error', err?.message || 'Erreur interne'))
            controller.close()
          }
        },
      })
      return new Response(stream, { headers: sseHeaders() })
    }

    const supabase = await createClient()
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Si pas d'utilisateur via cookies, essayer via Authorization header
    if (!user) {
      const authHeader = request.headers.get('authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const authResult = await supabase.auth.getUser(token)
        user = authResult.data.user
        authError = authResult.error
      }
    }
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Récupérer l'organisation active
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    const body = await request.json()
    const { message, conversation_history = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    // Simplifier : pas de logique complexe de détection - laisser le LLM utiliser les outils

    // Utiliser la clé API spécifique pour les autres organisations
    const PRIMARY_ORG_ID = '0c7de2b1-1550-4569-9bed-8544ae4d3651'
    const apiKey = membership.organization_id !== PRIMARY_ORG_ID
      ? (process.env.OPENAI_API_KEY_OTHER_ORGS || process.env.OPENAI_API_KEY)
      : process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API OpenAI manquante' }, { status: 500 })
    }

    // 1. Lancer en parallèle: classification (critique) et embeddings (best-effort)
    const embeddingsWork = (async () => {
      try {
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: apiKey,
          modelName: 'text-embedding-3-small',
        })
        const queryEmbedding = await embeddings.embedQuery(message)
        const { data: rpcDocs } = await supabase.rpc('match_document_embeddings', {
          query_embedding: queryEmbedding,
          match_threshold: 0.78,
          match_count: 3,
          filter_organization_id: membership.organization_id,
        })
        return Array.isArray(rpcDocs) ? rpcDocs : []
      } catch {
        return []
      }
    })()

    let similarDocs: any[] = []
    let context = ''

    const conversationHistory: ConversationTurn[] = conversation_history
      .filter((msg: any) => msg?.role && msg?.content)
      .map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content),
      }))

    // Log question côté serveur
    const snippet = message.slice(0, 200).replace(/\s+/g, ' ')
    console.log(`💬 Question (user=${user.id}, org=${membership.organization_id}): "${snippet}${message.length > 200 ? '…' : ''}"`)

    // Réécriture légère de la question pour clarifier
    const rewritten = await rewriteQuery({ message, apiKey })
    if (rewritten !== message) {
      console.log(`✏️  Query rewrite: "${message}" -> "${rewritten}"`)
    }
    console.log('🧭 Orchestrateur LLM: start')
    let classification: OrchestratorResult
    try {
      const timeoutMs = 5000
      classification = (await Promise.race([
        classifyIntent({
          message: rewritten,
          conversationHistory,
          apiKey,
          organizationId: membership.organization_id,
        }),
        new Promise<OrchestratorResult>((_, reject) =>
          setTimeout(() => reject(new Error('orchestrator_timeout')), timeoutMs)
        ),
      ])) as OrchestratorResult
      console.log('🧭 Orchestrateur LLM: ok')
    } catch (err: any) {
      console.warn(`🧭 Orchestrateur LLM: fallback heuristique (${err?.message || 'erreur inconnue'})`)
      classification = heuristicClassify(message)
    }

    // Récupérer les embeddings si disponibles, sans bloquer au-delà de 1200 ms
    try {
      const docs = await Promise.race([
        embeddingsWork,
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 1200)),
      ])
      similarDocs = docs
      if (docs.length > 0) {
        context = docs.map((doc: any) => doc.content).join('\n\n')
      }
    } catch {
      // pas de contexte vectoriel
    }

    console.log(
      `🧭 Orchestrateur: cible=${classification.target} confiance=${classification.confidence.toFixed(
        2
      )} | ${classification.reason} | paramètres=${JSON.stringify(classification.parameters || {})}`
    )

    const agentOptions = {
      message: rewritten,
      conversationHistory,
      apiKey,
      organizationId: membership.organization_id,
      context,
      parameters: classification.parameters,
      similarDocs,
    }

    // Propagation de contexte: compléter la référence si on parle de factures sans l'avoir fournie
    if (classification.target === 'invoices') {
      const carriedRef =
        (classification.parameters as any)?.reference ||
        (classification.parameters as any)?.product_reference ||
        extractReferenceFromText(rewritten) ||
        extractReferenceFromHistory(conversationHistory as ConversationTurn[])
      if (carriedRef) {
        agentOptions.parameters = { ...(agentOptions.parameters || {}), reference: carriedRef }
        console.log(`🔗 Contexte: référence propagée vers invoices = "${carriedRef}"`)
      }
    }

    let agentResult
    const requestStart = Date.now()

    try {
      if (
        classification.target === 'invoices' &&
        classification.parameters?.reference &&
        typeof classification.parameters.reference === 'string'
      ) {
        console.log(`⚡ FastPath: recherche factures par référence "${classification.parameters.reference}"`)
        const limit = parseLimitFromMessage(message)
        const invoices = await fetchInvoicesByItemReference(
          supabase,
          membership.organization_id,
          classification.parameters.reference,
          limit
        )

        if (invoices && invoices.length > 0) {
          const origin =
            request.headers.get('origin') ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'http://localhost:3000'
          const lines = invoices.map((inv, index) => {
            const totalHT = inv.extracted_data?.subtotal ?? null
            const totalTTC = inv.extracted_data?.total_amount ?? null
            const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Date inconnue'
            const link = `${origin}/invoices/${inv.id}`
            const matchList = inv.matches
              .map((match) => `• ${match.reference ?? 'N/A'} – ${match.description ?? 'Description manquante'}`)
              .join('\n    ')
            return `${index + 1}. Facture du ${date} (${inv.status ?? 'statut indisponible'}) – ${
              inv.supplier ?? 'Fournisseur inconnu'
            }\n   Montant HT: ${formatEuro(totalHT)} | Montant TTC: ${formatEuro(totalTTC)}\n   Lien: ${link}\n   Articles correspondants:\n    ${matchList}`
          })

          const responseText = `Voici les ${invoices.length} dernières factures contenant la référence ${classification.parameters.reference} :\n\n${lines.join(
            '\n\n'
          )}`

          agentResult = {
            response: responseText,
            sources: invoices.map((inv) => ({
              invoice_id: inv.id,
              metadata: {
                supplier: inv.supplier,
                invoice_date: inv.invoice_date,
                status: inv.status,
                reference: classification.parameters?.reference,
              },
            })),
          }
        }
      }

      // FastPath produits: recherche directe dans "products" par référence
      if (
        !agentResult &&
        classification.target === 'products' &&
        classification.parameters?.reference &&
        typeof classification.parameters.reference === 'string'
      ) {
        console.log(`⚡ FastPath: recherche produits par référence "${classification.parameters.reference}"`)
        const limit = parseLimitFromMessage(message)
        const products = await fetchProductsByReference(
          supabase,
          membership.organization_id,
          classification.parameters.reference,
          limit
        )
        if (products && products.length > 0) {
          const lines = products.map((p, i) => {
            const price = typeof p.price === 'number' ? `${p.price.toFixed(2)} €` : 'N/A'
            const tva = p.vat_rate != null ? `${p.vat_rate}%` : p.vat_code || '—'
            const unit = p.unit || '—'
            const supplier = p.supplier_name ? `${p.supplier_name}${p.supplier_code ? ` (${p.supplier_code})` : ''}` : '—'
            return `${i + 1}. ${p.reference} — ${p.name || 'Nom inconnu'}\n   Fournisseur: ${supplier} | Prix HT: ${price} | TVA: ${tva} | Unité: ${unit}\n   ${p.description || ''}`.trim()
          })
          agentResult = {
            response: `Résultat(s) pour la référence ${classification.parameters.reference}:\n\n${lines.join('\n\n')}`,
            sources: [],
          }
        }
      }

      // FastPath factures par mot-clé (ex: "jambon")
      if (
        !agentResult &&
        classification.target === 'invoices' &&
        !(classification.parameters as any)?.reference
      ) {
        const kw =
          extractKeyword(rewritten) || extractKeyword(message) || extractKeyword((conversationHistory.at(-1)?.content) || '')
        if (kw) {
          console.log(`⚡ FastPath: recherche factures par mot-clé "${kw}"`)
          const limit = parseLimitFromMessage(message)
          const invoicesByKw = await fetchInvoicesByKeyword(
            supabase,
            membership.organization_id,
            kw,
            limit
          )
          if (invoicesByKw && invoicesByKw.length > 0) {
            const origin =
              request.headers.get('origin') ||
              process.env.NEXT_PUBLIC_APP_URL ||
              'http://localhost:3000'
            const out = invoicesByKw.map((inv, idx) => {
              const totalHT = inv.extracted_data?.subtotal ?? null
              const totalTTC = inv.extracted_data?.total_amount ?? null
              const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Date inconnue'
              const link = `${origin}/invoices/${inv.id}`
              const itemList = inv.items
                .map((it) => `• ${it.reference || '—'} – ${it.description || 'Description manquante'}`)
                .join('\n    ')
              return `${idx + 1}. Facture du ${date} (${inv.status ?? 'statut indisponible'}) – ${inv.supplier ?? 'Fournisseur inconnu'}\n   Montant HT: ${formatEuro(totalHT)} | Montant TTC: ${formatEuro(totalTTC)}\n   Lien: ${link}\n   Articles correspondants:\n    ${itemList}`
            })
            agentResult = {
              response: `Voici les ${invoicesByKw.length} factures contenant "${kw}" :\n\n${out.join('\n\n')}`,
              sources: invoicesByKw.map((inv) => ({
                invoice_id: inv.id,
                metadata: { invoice_date: inv.invoice_date, supplier: inv.supplier, keyword: kw },
              })),
            }
          }
        }
      }

      if (!agentResult) {
        console.log(`🤖 Démarrage agent "${classification.target}"`)
        const agentStart = Date.now()
        switch (classification.target) {
          case 'products':
            agentResult = await runProductAgent(agentOptions)
            break
          case 'invoices':
            agentResult = await runInvoiceAgent(agentOptions)
            break
          case 'stats':
            agentResult = await runGeneralAgent({ ...agentOptions, agentName: 'stats' })
            break
          default:
            agentResult = await runGeneralAgent(agentOptions)
            break
        }
        console.log(`⏱️ Agent "${classification.target}" terminé en ${Date.now() - agentStart} ms`)
      }

      if (!agentResult?.response) {
        agentResult = await runGeneralAgent(agentOptions)
      }

      console.log(`✅ Réponse générée par l'agent "${classification.target}" en ${Date.now() - requestStart} ms`)

      return NextResponse.json({
        response: agentResult.response,
        sources: agentResult.sources,
      })
    } catch (error: any) {
      console.error('Erreur lors de la génération de la réponse:', error)
      return NextResponse.json(
        {
          error: 'Erreur lors du traitement de votre message',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Erreur dans /api/chat:', error)
    return NextResponse.json(
      { error: 'Erreur lors du traitement de votre message', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
