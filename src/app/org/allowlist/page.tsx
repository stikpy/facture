'use client'

import { useEffect, useState } from 'react'

export default function OrgAllowlistPage() {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<Array<{id:string, sender_email:string, created_at:string}>>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/orgs/allowlist')
    const data = await res.json()
    if (res.ok) setEntries(data.entries || [])
    else setError(data.error || 'Erreur de chargement')
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  const addEmail = async () => {
    const v = email.trim().toLowerCase()
    if (!v) return
    setError(null)
    const res = await fetch('/api/orgs/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_email: v })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Erreur'); return }
    setEmail('')
    await load()
  }

  const remove = async (id: string) => {
    setError(null)
    const res = await fetch(`/api/orgs/allowlist?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(()=>({}))
      setError((data as any)?.error || 'Erreur')
      return
    }
    await load()
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Emails autorisés (réception)</h1>

      <div className="bg-white border rounded p-4 space-y-4">
        <div className="flex gap-2">
          <input
            className="border rounded px-2 py-1 flex-1"
            placeholder="expediteur@domaine.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==='Enter') addEmail() }}
          />
          <button onClick={addEmail} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Ajouter</button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="bg-white border rounded">
        <div className="px-4 py-2 border-b font-medium">Liste des expéditeurs</div>
        {loading ? (
          <div className="p-4">Chargement…</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Aucun email autorisé pour l'organisation courante.</div>
        ) : (
          <ul className="divide-y">
            {entries.map((e)=> (
              <li key={e.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <div className="font-mono text-sm">{e.sender_email}</div>
                  <div className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</div>
                </div>
                <button className="text-sm px-2 py-1 rounded border" onClick={()=>remove(e.id)}>Supprimer</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}


