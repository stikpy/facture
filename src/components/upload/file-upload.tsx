'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase-client'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'

interface UploadedFile {
  file: File
  id: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
}

export function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    console.log('🎯 [CLIENT] ===== FONCTION onDrop APPELÉE =====')
    console.log('🎯 [CLIENT] Nombre de fichiers:', acceptedFiles.length)
    console.log('🚀 [CLIENT] Début du processus d\'upload:', acceptedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })))
    setIsUploading(true)
    
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'uploading',
      progress: 0
    }))

    setFiles(prev => [...prev, ...newFiles])

    // Traiter chaque fichier
    for (const fileData of newFiles) {
      try {
        console.log(`📤 [CLIENT] Début traitement pour: ${fileData.file.name} (ID: ${fileData.id})`)
        await uploadAndProcessFile(fileData)
      } catch (error) {
        console.error(`❌ [CLIENT] Erreur upload pour ${fileData.file.name}:`, error)
        updateFileStatus(fileData.id, 'error', 0, (error as Error).message)
      }
    }

    console.log('🏁 [CLIENT] Tous les uploads terminés')
    setIsUploading(false)
  }, [])

  const uploadAndProcessFile = async (fileData: UploadedFile) => {
    try {
      console.log('🚀 [CLIENT] ===== DÉBUT UPLOAD =====')
      console.log(`📁 [CLIENT] Fichier: ${fileData.file.name}`)
      console.log(`📁 [CLIENT] Taille: ${fileData.file.size} bytes`)
      console.log(`📁 [CLIENT] Type: ${fileData.file.type}`)
      
      // 1. Upload du fichier
      console.log(`📡 [CLIENT] Début upload pour ${fileData.file.name}`)
      updateFileStatus(fileData.id, 'uploading', 25)
      
      const formData = new FormData()
      formData.append('file', fileData.file)
      
      console.log(`📤 [CLIENT] Envoi requête POST vers /api/upload pour ${fileData.file.name}`)
      
      // Vérifier que l'utilisateur est connecté
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        console.error('❌ [CLIENT] Utilisateur non connecté')
        throw new Error('Vous devez être connecté pour uploader des fichiers')
      }
      
      console.log('✅ [CLIENT] Utilisateur connecté:', user.email)
      
      // Récupérer le token d'authentification
      console.log('🔍 [CLIENT] Récupération de la session...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('📋 [CLIENT] Session récupérée:', session ? 'Présente' : 'Absente')
      console.log('❌ [CLIENT] Erreur session:', sessionError)
      
      const token = session?.access_token
      console.log('🔑 [CLIENT] Token extrait:', token ? 'Présent' : 'Absent')
      
      if (!token) {
        console.error('❌ [CLIENT] Aucun token d\'authentification trouvé')
        console.error('❌ [CLIENT] Session complète:', session)
        throw new Error('Session expirée, veuillez vous reconnecter')
      }
      
      console.log('🔑 [CLIENT] Token d\'authentification trouvé:', token.substring(0, 20) + '...')
      console.log('🔍 [CLIENT] Token complet:', token)
      console.log('🔍 [CLIENT] Type du token:', typeof token)
      console.log('🔍 [CLIENT] Longueur du token:', token?.length)
      
      console.log('🌐 [CLIENT] Envoi de la requête fetch vers /api/upload...')
      console.log('🌐 [CLIENT] Headers à envoyer:', { 'Authorization': `Bearer ${token}` })
      
      // Ajouter un timeout pour éviter que la requête se bloque
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('⏰ [CLIENT] Timeout de la requête fetch (30s)')
        controller.abort()
      }, 30000)
      
      let response
      try {
        response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        console.log('📡 [CLIENT] Requête fetch terminée, traitement de la réponse...')
      } catch (error) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
          console.error('⏰ [CLIENT] Requête fetch annulée par timeout')
          throw new Error('La requête a pris trop de temps (timeout)')
        } else {
          console.error('❌ [CLIENT] Erreur fetch:', error)
          throw error
        }
      }

      console.log(`📊 [CLIENT] Réponse upload: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ [CLIENT] Erreur upload ${response.status}:`, errorText)
        throw new Error(`Erreur lors de l'upload: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log(`✅ [CLIENT] Upload réussi pour ${fileData.file.name}:`, result)
      
      // 2. Traitement du fichier
      console.log(`🔄 [CLIENT] Début traitement IA pour ${fileData.file.name}`)
      updateFileStatus(fileData.id, 'processing', 50)
      
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId: result.fileId,
          fileName: fileData.file.name
        })
      })

      console.log(`📊 [CLIENT] Réponse traitement: ${processResponse.status} ${processResponse.statusText}`)

      if (!processResponse.ok) {
        const errorText = await processResponse.text()
        console.error(`❌ [CLIENT] Erreur traitement ${processResponse.status}:`, errorText)
        throw new Error(`Erreur lors du traitement: ${processResponse.status} ${processResponse.statusText}`)
      }

      console.log(`✅ [CLIENT] Traitement terminé pour ${fileData.file.name}`)
      updateFileStatus(fileData.id, 'completed', 100)
      
    } catch (error) {
      console.error(`❌ [CLIENT] Erreur dans uploadAndProcessFile pour ${fileData.file.name}:`, error)
      updateFileStatus(fileData.id, 'error', 0, (error as Error).message)
    }
  }

  const updateFileStatus = (id: string, status: UploadedFile['status'], progress: number, error?: string) => {
    setFiles(prev => prev.map(file => 
      file.id === id 
        ? { ...file, status, progress, error }
        : file
    ))
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true
  })

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <LoadingSpinner size="sm" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return null
    }
  }

  const getStatusText = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return 'Upload en cours...'
      case 'processing':
        return 'Traitement IA...'
      case 'completed':
        return 'Terminé'
      case 'error':
        return 'Erreur'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Zone de drop */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <p className="text-lg font-medium text-gray-900">
            {isDragActive ? 'Déposez vos factures ici' : 'Glissez-déposez vos factures'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            ou cliquez pour sélectionner des fichiers
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, JPG, PNG, TIFF (max 10MB)
          </p>
        </div>
      </div>

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-gray-900">
            Fichiers en cours de traitement
          </h3>
          <div className="space-y-2">
            {files.map((fileData) => (
              <div
                key={fileData.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg border"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {fileData.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(fileData.file.size)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {getStatusIcon(fileData.status)}
                  <span className="text-sm text-gray-600">
                    {getStatusText(fileData.status)}
                  </span>
                  {fileData.status === 'uploading' || fileData.status === 'processing' ? (
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${fileData.progress}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
