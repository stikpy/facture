import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { DocumentProcessor } from '@/lib/ai/document-processor'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const status = searchParams.get('status') || 'all'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!query) {
      return NextResponse.json({ error: 'Paramètre de recherche requis' }, { status: 400 })
    }

    // On récupère d'abord les factures de l'utilisateur (filtre statut si fourni)
    let base = supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      base = base.eq('status', status)
    }

    const { data: rows, error } = await base.limit(1000)
    if (error) throw error

    // Filtrage applicatif: fournisseur, numéro, montant, items.description, file_name
    const term = (query || '').trim().toLowerCase()
    const maybeAmount = Number(term.replace(',', '.'))
    const isAmount = !Number.isNaN(maybeAmount) && term !== ''

    const filtered = (rows || []).filter((inv: any) => {
      const ed = inv.extracted_data || {}
      const items = Array.isArray(ed.items) ? ed.items : []
      const haystackParts = [
        inv.file_name,
        ed.supplier_name,
        ed.invoice_number,
        ...(items.map((it: any) => it?.description)),
      ].filter(Boolean).map((s: any) => String(s).toLowerCase())

      const textMatch = term
        ? haystackParts.some((s: string) => s.includes(term))
        : true

      const amountFields = [ed.total_amount, ed.subtotal, ed.tax_amount]
        .filter((n: any) => typeof n === 'number') as number[]
      const itemAmounts = items
        .flatMap((it: any) => [it?.unit_price, it?.total_price])
        .filter((n: any) => typeof n === 'number') as number[]
      const allAmounts = [...amountFields, ...itemAmounts]
      const amountMatch = isAmount
        ? allAmounts.some((n) => Math.abs(n - maybeAmount) < 0.01)
        : true

      return textMatch && amountMatch
    })

    const total = filtered.length
    const results = filtered.slice(offset, offset + limit)

    // Optionnel: recherche sémantique (non bloquante)
    let semanticResults: any[] = []
    try {
      const documentProcessor = new DocumentProcessor()
      const sem = await documentProcessor.searchSimilarInvoices(term, 5)
      semanticResults = sem.map(doc => ({ content: doc.pageContent, metadata: doc.metadata }))
    } catch {}

    return NextResponse.json({ success: true, results, total, limit, offset, semanticResults })

  } catch (error) {
    console.error('Erreur recherche:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recherche' },
      { status: 500 }
    )
  }
}
