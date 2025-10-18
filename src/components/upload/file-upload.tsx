'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
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
  const supabase = createClientComponentClient()

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
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
        await uploadAndProcessFile(fileData)
      } catch (error) {
        console.error('Erreur upload:', error)
        updateFileStatus(fileData.id, 'error', 0, (error as Error).message)
      }
    }

    setIsUploading(false)
  }, [supabase])

  const uploadAndProcessFile = async (fileData: UploadedFile) => {
    try {
      // 1. Upload du fichier
      updateFileStatus(fileData.id, 'uploading', 25)
      
      const formData = new FormData()
      formData.append('file', fileData.file)
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload')
      }

      const result = await response.json()
      
      // 2. Traitement du fichier
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

      if (!processResponse.ok) {
        throw new Error('Erreur lors du traitement')
      }

      updateFileStatus(fileData.id, 'completed', 100)
      
    } catch (error) {
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
