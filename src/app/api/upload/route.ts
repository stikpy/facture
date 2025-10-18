import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    
    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    // Vérifier la taille du fichier
    const maxSize = parseInt(process.env.UPLOAD_MAX_SIZE || '10485760') // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 })
    }

    // Vérifier le type de fichier
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff'
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non supporté' }, { status: 400 })
    }

    // Convertir le fichier en buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload vers Supabase Storage
    const storageService = new StorageService()
    const { path, url } = await storageService.uploadFile(
      buffer,
      file.name,
      file.type,
      user.id
    )

    // Enregistrer en base de données
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
      // Supprimer le fichier uploadé en cas d'erreur
      await storageService.deleteFile(path)
      throw dbError
    }

    return NextResponse.json({
      success: true,
      fileId: invoice.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    })

  } catch (error) {
    console.error('Erreur upload:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'upload du fichier' },
      { status: 500 }
    )
  }
}
