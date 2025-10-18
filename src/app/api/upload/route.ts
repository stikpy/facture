import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { StorageService } from '@/lib/storage'

export async function POST(request: NextRequest) {
  console.log('🚀 [SERVER] Début de la requête POST /api/upload')
  
  try {
    console.log('🔧 [SERVER] Création du client Supabase serveur')
    const supabase = await createServerSupabaseClient()

    console.log('🔐 [SERVER] Vérification de l\'authentification via cookies')
    let {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user) {
      console.log('🔄 [SERVER] Aucun utilisateur via cookies, tentative via Authorization header')
      const authHeader = request.headers.get('authorization')
      console.log('📋 [SERVER] Authorization header:', authHeader ? 'Présent' : 'Manquant')

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        console.log('🔑 [SERVER] Token JWT extrait:', token.substring(0, 20) + '...')
        const authResult = await supabase.auth.getUser(token)
        user = authResult.data.user
        authError = authResult.error
      }
    }

    if (authError) {
      console.error('❌ [SERVER] Erreur d\'authentification:', authError)
      return NextResponse.json({
        error: 'Token invalide: ' + authError.message
      }, { status: 401 })
    }
    
    if (!user) {
      console.error('❌ [SERVER] Aucun utilisateur authentifié')
      return NextResponse.json({
        error: 'Session invalide',
        description: 'L\'utilisateur n\'a pas de session active ou n\'est pas authentifié'
      }, { status: 401 })
    }
    
    console.log(`✅ [SERVER] Utilisateur authentifié: ${user.email} (ID: ${user.id})`)

    console.log('📄 [SERVER] Récupération des données du formulaire')
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.error('❌ [SERVER] Aucun fichier fourni dans la requête')
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }
    
    console.log(`📁 [SERVER] Fichier reçu: ${file.name} (${file.size} bytes, ${file.type})`)

    // Vérifier la taille du fichier
    const maxSize = parseInt(process.env.UPLOAD_MAX_SIZE || '10485760') // 10MB
    console.log(`📏 [SERVER] Vérification de la taille: ${file.size} / ${maxSize} bytes`)
    
    if (file.size > maxSize) {
      console.error(`❌ [SERVER] Fichier trop volumineux: ${file.size} > ${maxSize}`)
      return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 })
    }

    // Vérifier le type de fichier
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff'
    ]
    
    console.log(`🔍 [SERVER] Vérification du type: ${file.type}`)
    if (!allowedTypes.includes(file.type)) {
      console.error(`❌ [SERVER] Type de fichier non supporté: ${file.type}`)
      return NextResponse.json({ error: 'Type de fichier non supporté' }, { status: 400 })
    }

    // Convertir le fichier en buffer
    console.log('🔄 [SERVER] Conversion du fichier en buffer')
    const buffer = Buffer.from(await file.arrayBuffer())
    console.log(`📦 [SERVER] Buffer créé: ${buffer.length} bytes`)

    // Upload vers Supabase Storage
    console.log('☁️ [SERVER] Upload vers Supabase Storage')
    const storageService = new StorageService()
    const { path, url } = await storageService.uploadFile(
      buffer,
      file.name,
      file.type,
      user.id
    )
    console.log(`✅ [SERVER] Fichier uploadé vers: ${path}`)

    // Enregistrer en base de données
    console.log('💾 [SERVER] Enregistrement en base de données')
    const { data: invoice, error: dbError } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        status: 'pending'
      })
      .select()
      .single()

    if (dbError) {
      console.error('❌ [SERVER] Erreur base de données:', dbError)
      // Supprimer le fichier uploadé en cas d'erreur
      console.log('🗑️ [SERVER] Suppression du fichier uploadé en cas d\'erreur')
      await storageService.deleteFile(path)
      throw dbError
    }
    
    console.log(`✅ [SERVER] Facture enregistrée avec l'ID: ${invoice.id}`)

    const response = {
      success: true,
      fileId: invoice.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    }
    
    console.log('🎉 [SERVER] Upload terminé avec succès:', response)
    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ [SERVER] Erreur upload:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'upload du fichier: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
