import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// GET: Récupérer un produit spécifique
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
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

    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        suppliers (
          id,
          display_name,
          code
        )
      `)
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Erreur serveur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT: Mettre à jour un produit
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
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

    // Vérifier que le produit existe et appartient à l'organisation
    const { data: existing } = await supabase
      .from('products')
      .select('id, supplier_id, reference')
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
    }

    const body = await request.json()
    const { reference, name, price, vat_rate, vat_code, unit, description, is_active } = body

    // Si la référence change, vérifier l'unicité
    if (reference && reference.trim().toUpperCase() !== existing.reference) {
      const { data: duplicate } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', membership.organization_id)
        .eq('supplier_id', existing.supplier_id)
        .eq('reference', reference.trim().toUpperCase())
        .neq('id', params.id)
        .single()

      if (duplicate) {
        return NextResponse.json({ error: 'Un produit avec cette référence existe déjà pour ce fournisseur' }, { status: 409 })
      }
    }

    // Mettre à jour le produit
    const updateData: any = {}
    if (reference !== undefined) updateData.reference = reference.trim().toUpperCase()
    if (name !== undefined) updateData.name = name.trim()
    if (price !== undefined) updateData.price = Number(price)
    if (vat_rate !== undefined) updateData.vat_rate = vat_rate ? Number(vat_rate) : null
    if (vat_code !== undefined) updateData.vat_code = vat_code || null
    if (unit !== undefined) updateData.unit = unit
    if (description !== undefined) updateData.description = description?.trim() || null
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: product, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', params.id)
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
      console.error('Erreur lors de la mise à jour du produit:', error)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du produit' }, { status: 500 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Erreur serveur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE: Supprimer un produit
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
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

    // Vérifier que le produit existe et appartient à l'organisation
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
    }

    // Supprimer le produit
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Erreur lors de la suppression du produit:', error)
      return NextResponse.json({ error: 'Erreur lors de la suppression du produit' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur serveur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

