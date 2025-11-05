'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

export function AuthPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [useMagicLink, setUseMagicLink] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    console.log('🔐 [AUTH] Début de l\'authentification')
    console.log('📧 [AUTH] Email:', email)
    console.log('🔗 [AUTH] Magic link activé:', useMagicLink)
    console.log('📝 [AUTH] Inscription:', isSignUp)

    try {
      const supabase = createClient()
      console.log('✅ [AUTH] Client Supabase créé')
      
      if (useMagicLink) {
        console.log('🔗 [AUTH] Tentative de connexion par magic link')
        console.log('🌐 [AUTH] URL de redirection:', `${window.location.origin}/auth/callback`)
        
        const { data, error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        })
        
        console.log('📤 [AUTH] Réponse magic link:', { data, error })
        
        if (error) {
          console.error('❌ [AUTH] Erreur magic link:', error)
          throw error
        }
        
        console.log('✅ [AUTH] Magic link envoyé avec succès')
        setMagicLinkSent(true)
      } else if (isSignUp) {
        console.log('📝 [AUTH] Tentative d\'inscription')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              pending_org_name: orgName,
            }
          }
        })
        
        console.log('📤 [AUTH] Réponse inscription:', { data, error })
        
        if (error) {
          console.error('❌ [AUTH] Erreur inscription:', error)
          throw error
        }
        
        console.log('✅ [AUTH] Inscription réussie, vérifiez votre email')
        // Mémoriser localement le nom d'organisation pour création post-login
        try { localStorage.setItem('pending_org_name', orgName || '') } catch {}
        alert('Vérifiez votre email pour confirmer votre compte. Votre organisation sera créée à la première connexion.')
      } else {
        console.log('🔑 [AUTH] Tentative de connexion par mot de passe')
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        console.log('📤 [AUTH] Réponse connexion:', { data, error })
        
        if (error) {
          console.error('❌ [AUTH] Erreur connexion:', error)
          throw error
        }
        
        console.log('✅ [AUTH] Connexion réussie')
        
        // Vérifier que l'utilisateur est bien connecté avant de rediriger
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        console.log('🔍 [AUTH] Utilisateur après connexion:', currentUser ? `${currentUser.email} (${currentUser.id})` : 'Non connecté')
        
        if (currentUser) {
          // Créer l'organisation si besoin
          try {
            const pending = (localStorage.getItem('pending_org_name') || '').trim()
            const orgsRes = await fetch('/api/orgs')
            if (orgsRes.ok) {
              const j = await orgsRes.json()
              const hasOrg = Array.isArray(j.organizations) && j.organizations.length > 0
              if (!hasOrg && pending) {
                await fetch('/api/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pending }) })
                localStorage.removeItem('pending_org_name')
              }
            }
          } catch {}
          console.log('🔄 [AUTH] Redirection vers le dashboard...')
          // Rediriger vers le dashboard après connexion réussie
          setTimeout(() => {
            window.location.href = '/'
          }, 1000)
        } else {
          console.error('❌ [AUTH] Utilisateur non connecté après connexion')
        }
      }
    } catch (error) {
      console.error('❌ [AUTH] Erreur générale:', error)
      console.error('❌ [AUTH] Type d\'erreur:', typeof error)
      console.error('❌ [AUTH] Message d\'erreur:', (error as Error).message)
      console.error('❌ [AUTH] Stack trace:', (error as Error).stack)
      alert('Erreur: ' + (error as Error).message)
    } finally {
      console.log('🏁 [AUTH] Fin du processus d\'authentification')
      setIsLoading(false)
    }
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Email envoyé !
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Nous avons envoyé un lien de connexion à <strong>{email}</strong>
            </p>
            <p className="mt-4 text-center text-sm text-gray-500">
              Vérifiez votre boîte de réception et cliquez sur le lien pour vous connecter.
            </p>
            <button
              onClick={() => {
                setMagicLinkSent(false)
                setEmail('')
              }}
              className="mt-6 text-sm text-primary hover:text-primary/80"
            >
              ← Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {useMagicLink ? 'Connexion par email' : (isSignUp ? 'Créer un compte' : 'Se connecter')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {useMagicLink ? (
              'Entrez votre email pour recevoir un lien de connexion'
            ) : (
              <>
                {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="font-medium text-primary hover:text-primary/80"
                >
                  {isSignUp ? 'Se connecter' : 'Créer un compte'}
                </button>
              </>
            )}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-4">
            {isSignUp && !useMagicLink && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                  Nom complet
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required={isSignUp && !useMagicLink}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            )}
            {isSignUp && !useMagicLink && (
              <div>
                <label htmlFor="orgName" className="block text-sm font-medium text-gray-700">
                  Nom de l'organisation
                </label>
                <input
                  id="orgName"
                  name="orgName"
                  type="text"
                  required={isSignUp && !useMagicLink}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Adresse email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
            {!useMagicLink && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required={!useMagicLink}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            )}
          </div>

          {!isSignUp && (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="magic-link"
                  name="magic-link"
                  type="checkbox"
                  checked={useMagicLink}
                  onChange={(e) => setUseMagicLink(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor="magic-link" className="ml-2 block text-sm text-gray-900">
                  Connexion par email (magic link)
                </label>
              </div>
            </div>
          )}

          <div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : null}
              {useMagicLink 
                ? 'Envoyer le lien de connexion' 
                : (isSignUp ? 'Créer le compte' : 'Se connecter')
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
