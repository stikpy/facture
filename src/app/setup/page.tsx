import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText, Database, Key, Settings } from 'lucide-react'

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-2xl mx-auto p-8">
        <div className="text-center mb-8">
          <FileText className="mx-auto h-16 w-16 text-primary mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Facture AI - Configuration
          </h1>
          <p className="text-gray-600">
            Alternative à Yooz avec IA pour le traitement intelligent de factures
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-900">
            Configuration requise
          </h2>
          
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <Database className="h-6 w-6 text-blue-600 mt-1" />
              <div>
                <h3 className="font-medium text-gray-900">1. Supabase</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Créez un projet Supabase et configurez les variables d'environnement
                </p>
                <ul className="text-xs text-gray-500 mt-2 space-y-1">
                  <li>• NEXT_PUBLIC_SUPABASE_URL</li>
                  <li>• NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  <li>• SUPABASE_SERVICE_ROLE_KEY</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <Key className="h-6 w-6 text-green-600 mt-1" />
              <div>
                <h3 className="font-medium text-gray-900">2. OpenAI</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Obtenez une clé API OpenAI pour l'IA
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  • OPENAI_API_KEY
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <Settings className="h-6 w-6 text-purple-600 mt-1" />
              <div>
                <h3 className="font-medium text-gray-900">3. Base de données</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Exécutez les migrations SQL dans Supabase
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  • Utilisez le fichier supabase/migrations/001_initial_schema.sql
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">
              📋 Instructions détaillées
            </h4>
            <ol className="text-sm text-yellow-700 space-y-2">
              <li>1. Créez un fichier <code className="bg-yellow-100 px-1 rounded">.env.local</code></li>
              <li>2. Copiez le contenu de <code className="bg-yellow-100 px-1 rounded">env.example</code></li>
              <li>3. Remplissez vos vraies clés API</li>
              <li>4. Redémarrez le serveur : <code className="bg-yellow-100 px-1 rounded">npm run dev</code></li>
            </ol>
          </div>

          <div className="mt-6 flex space-x-4">
            <Link href="/">
              <Button>
                Retour à l'application
              </Button>
            </Link>
            <Button variant="outline" asChild>
              <a href="https://github.com/stikpy/facture" target="_blank" rel="noopener noreferrer">
                Voir sur GitHub
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Une fois configuré, votre alternative à Yooz sera opérationnelle ! 🚀</p>
        </div>
      </div>
    </div>
  )
}
