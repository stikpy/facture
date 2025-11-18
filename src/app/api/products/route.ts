import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// GET: Récupérer les produits d'une organisation, optionnellement filtrés par fournisseur
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Récupérer l'organisation active de l'utilisateur
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const isActive = searchParams.get('is_active')
    const search = searchParams.get('search') // Recherche par référence ou nom
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')
    const sortKey = searchParams.get('sort') || 'name'
    const sortDir = (searchParams.get('dir') || 'asc') as 'asc' | 'desc'
    const limit = Math.min(Math.max(Number(limitParam || 25), 1), 100)
    const offset = Math.max(Number(offsetParam || 0), 0)

    let query = supabase
      .from('products')
      .select(`
        *,
        suppliers (
          id,
          display_name,
          code
        )
      `, { count: 'exact', head: false })
      .eq('organization_id', membership.organization_id)

    // Filtrer par fournisseur si fourni
    if (supplierId) {
      query = query.eq('supplier_id', supplierId)
    }

    // Filtrer par statut actif/inactif si fourni
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    // Recherche par référence ou nom
    if (search) {
      query = query.or(`reference.ilike.%${search}%,name.ilike.%${search}%`)
    }

    // Tri
    const allowedSort = new Set(['name', 'reference', 'updated_at', 'created_at', 'price'])
    const sortCol = allowedSort.has(sortKey) ? sortKey : 'name'
    query = query.order(sortCol as any, { ascending: sortDir === 'asc' })

    // Pagination
    const start = offset
    const end = offset + limit - 1
    query = query.range(start, end)

    const { data: products, error, count } = await query

    if (error) {
      console.error('Erreur lors de la récupération des produits:', error)
      return NextResponse.json({ error: 'Erreur lors de la récupération des produits' }, { status: 500 })
    }

    return NextResponse.json({ products: products || [], count: count ?? 0 })
  } catch (error) {
    console.error('Erreur serveur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST: Créer un nouveau produit
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Récupérer l'organisation active de l'utilisateur
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    const body = await request.json()
    const { supplier_id, reference, name, price, vat_rate, vat_code, unit, description, is_active } = body

    // Validation
    if (!supplier_id || !reference || !name || price === undefined) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const normalizedRef = reference.trim().toUpperCase()
    const normalizedName = name.trim()

    // Vérifier que le fournisseur appartient à l'organisation
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', supplier_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!supplier) {
      return NextResponse.json({ error: 'Fournisseur non trouvé ou n\'appartient pas à l\'organisation' }, { status: 404 })
    }

    // Vérifier l'unicité de la référence pour ce fournisseur et cette organisation
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('supplier_id', supplier_id)
      .eq('reference', normalizedRef)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Un produit avec cette référence existe déjà pour ce fournisseur' }, { status: 409 })
    }

    // Créer le produit
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        organization_id: membership.organization_id,
        supplier_id,
        reference: normalizedRef,
        name: normalizedName,
        price: Number(price),
        vat_rate: vat_rate ? Number(vat_rate) : null,
        vat_code: vat_code || null,
        unit: unit || 'pièce',
        description: description?.trim() || null,
        is_active: is_active !== false
      })
      .select(`
        *,
        suppliers (
          id,
          display_name,
          code
        )
      `)
      .single()

    if (error) {
      // Conflit d'unicité (doublon)
      if ((error as any).code === '23505') {
        return NextResponse.json({ error: 'Un produit avec cette référence existe déjà pour ce fournisseur' }, { status: 409 })
      }
      console.error('Erreur lors de la création du produit:', error)
      return NextResponse.json({ error: 'Erreur lors de la création du produit' }, { status: 500 })
    }

    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    console.error('Erreur serveur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

