import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Récupérer l'organisation active de l'utilisateur
    const { data: memberships } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ 
        byMonth: [],
        total: { tokens: 0, cost: 0, costMarkedUp: 0 },
        summary: []
      })
    }

    const organizationId = memberships[0].organization_id
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')

    // Construire la requête
    let query = (supabaseAdmin as any)
      .from('token_usage')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    const { data: usageRecords, error } = await query

    if (error) {
      console.error('Erreur récupération token usage:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Agréger par mois
    const byMonthMap = new Map<string, {
      month: string
      input_tokens: number
      output_tokens: number
      total_tokens: number
      total_cost: number
      total_cost_marked_up: number
      count: number
    }>()

    let totalTokens = 0
    let totalCost = 0
    let totalCostMarkedUp = 0

    for (const record of (usageRecords || [])) {
      const date = new Date(record.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      const existing = byMonthMap.get(monthKey) || {
        month: monthKey,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        total_cost: 0,
        total_cost_marked_up: 0,
        count: 0,
      }

      existing.input_tokens += record.input_tokens || 0
      existing.output_tokens += record.output_tokens || 0
      existing.total_tokens += record.total_tokens || 0
      existing.total_cost += Number(record.total_cost || 0)
      existing.total_cost_marked_up += Number(record.total_cost_marked_up || 0)
      existing.count += 1

      byMonthMap.set(monthKey, existing)

      totalTokens += record.total_tokens || 0
      totalCost += Number(record.total_cost || 0)
      totalCostMarkedUp += Number(record.total_cost_marked_up || 0)
    }

    const byMonth = Array.from(byMonthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))

    // Agréger par type d'opération
    const byOperation = new Map<string, {
      operation: string
      total_tokens: number
      total_cost_marked_up: number
      count: number
    }>()

    for (const record of (usageRecords || [])) {
      const op = record.operation_type || 'extraction'
      const existing = byOperation.get(op) || {
        operation: op,
        total_tokens: 0,
        total_cost_marked_up: 0,
        count: 0,
      }

      existing.total_tokens += record.total_tokens || 0
      existing.total_cost_marked_up += Number(record.total_cost_marked_up || 0)
      existing.count += 1

      byOperation.set(op, existing)
    }

    const summary = Array.from(byOperation.values())

    return NextResponse.json({
      byMonth,
      total: {
        tokens: totalTokens,
        cost: Number(totalCost.toFixed(4)),
        costMarkedUp: Number(totalCostMarkedUp.toFixed(4)),
      },
      summary,
    })

  } catch (error) {
    console.error('Erreur API token-usage:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

