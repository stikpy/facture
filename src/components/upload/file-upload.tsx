'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/utils/supabase/client'
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
      
      // Vérifier que l'utilisateur est connecté et récupérer le token
      const supabase = createClient()
      
      // Forcer la synchronisation des cookies avant de vérifier l'utilisateur
      console.log('🔄 [CLIENT] Synchronisation des cookies...')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.error('❌ [CLIENT] Aucune session trouvée')
        throw new Error('Vous devez être connecté pour uploader des fichiers')
      }

      console.log('✅ [CLIENT] Utilisateur connecté:', session.user.email)
      console.log('🔑 [CLIENT] Token JWT disponible:', session.access_token ? 'Oui' : 'Non')

      console.log('🌐 [CLIENT] Envoi de la requête fetch vers /api/upload...')

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
          body: formData,
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          },
          credentials: 'include',
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
      
      // 2. Ajouter à la queue de traitement
      console.log(`📋 [CLIENT] Ajout à la queue pour ${fileData.file.name}`)
      updateFileStatus(fileData.id, 'processing', 50)
      
      const queueResponse = await fetch('/api/queue/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          invoiceId: result.fileId
        })
      })

      if (!queueResponse.ok) {
        const errorData = await queueResponse.json()
        throw new Error(errorData.error || 'Erreur lors de l\'ajout à la queue')
      }

      const queueResult = await queueResponse.json()
      console.log(`✅ [CLIENT] Ajouté à la queue pour ${fileData.file.name}:`, queueResult)
      
      // 3. Polling pour suivre le statut
      await pollProcessingStatus(result.fileId, fileData.id, session.access_token)
      
    } catch (error) {
      console.error(`❌ [CLIENT] Erreur dans uploadAndProcessFile pour ${fileData.file.name}:`, error)
      updateFileStatus(fileData.id, 'error', 0, (error as Error).message)
    }
  }

  const pollProcessingStatus = async (invoiceId: string, fileId: string, token: string) => {
    const maxAttempts = 60 // 5 minutes max (5s * 60)
    let attempts = 0

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        updateFileStatus(fileId, 'error', 0, 'Timeout: le traitement prend trop de temps')
        return
      }

      attempts++

      try {
        const statusResponse = await fetch(`/api/queue/status?invoiceId=${invoiceId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!statusResponse.ok) {
          throw new Error('Erreur lors de la récupération du statut')
        }

        const statusData = await statusResponse.json()
        console.log(`📊 [CLIENT] Statut queue:`, statusData)

        if (statusData.status === 'completed') {
          updateFileStatus(fileId, 'completed', 100)
          return
        } else if (statusData.status === 'failed' || statusData.status === 'error') {
          updateFileStatus(fileId, 'error', 0, statusData.errorMessage || 'Erreur lors du traitement')
          return
        } else if (statusData.status === 'processing') {
          updateFileStatus(fileId, 'processing', 75)
        } else {
          // pending
          updateFileStatus(fileId, 'processing', 60)
        }

        // Continuer le polling
        setTimeout(poll, 5000) // Vérifier toutes les 5 secondes
      } catch (error) {
        console.error('❌ [CLIENT] Erreur polling:', error)
        updateFileStatus(fileId, 'error', 0, (error as Error).message)
      }
    }

    await poll()
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
