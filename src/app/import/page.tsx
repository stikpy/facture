'use client'

import { StatsCards } from '@/components/dashboard/stats-cards'
import { FileUpload } from '@/components/upload/file-upload'

export default function ImportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Importer des factures</h1>
          <p className="text-sm text-gray-500 mt-1">Glissez-déposez vos fichiers ou cliquez pour sélectionner (PDF, JPG, PNG, TIFF).</p>
        </div>
        <StatsCards />
        <FileUpload />
      </div>
    </div>
  )
}


