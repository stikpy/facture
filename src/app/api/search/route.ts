import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { DocumentProcessor } from '@/lib/ai/document-processor'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!query) {
      return NextResponse.json({ error: 'Paramètre de recherche requis' }, { status: 400 })
    }

    // Recherche dans les données extraites
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .textSearch('extracted_data', query)
      .limit(limit)

    if (error) {
      throw error
    }

    // Recherche sémantique avec LangChain (optionnel)
    const documentProcessor = new DocumentProcessor()
    const semanticResults = await documentProcessor.searchSimilarInvoices(query, limit)

    return NextResponse.json({
      success: true,
      results: invoices || [],
      semanticResults: semanticResults.map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata
      })),
      total: invoices?.length || 0
    })

  } catch (error) {
    console.error('Erreur recherche:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recherche' },
      { status: 500 }
    )
  }
}
