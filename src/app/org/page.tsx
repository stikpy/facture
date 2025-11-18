'use client'

import { useEffect, useState } from 'react'

export default function OrgAdminPage() {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<any[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [newOrgName, setNewOrgName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inboundAddress, setInboundAddress] = useState('')
  const [inboundList, setInboundList] = useState<Array<{full_address:string, created_at:string}>>([])
  const [accounts, setAccounts] = useState<Array<{id:string, code:string, label:string, synonyms?:string[] }>>([])
  const [newAccountCode, setNewAccountCode] = useState('')
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [newAccountSynonyms, setNewAccountSynonyms] = useState('')
  const [vatCodes, setVatCodes] = useState<Array<{id:string, code:string, label:string, rate:number, synonyms?:string[] }>>([])
  const [newVatCode, setNewVatCode] = useState('')
  const [newVatLabel, setNewVatLabel] = useState('')
  const [newVatRate, setNewVatRate] = useState('20')
  const [newVatSynonyms, setNewVatSynonyms] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/orgs')
    const data = await res.json()
    if (res.ok) {
      setOrgs(data.organizations || [])
      setActiveOrgId(data.activeOrganizationId || null)
    }
    await loadInboundAddresses()
    await loadAccounts()
    await loadVatCodes()
    await loadMembers()
    setLoading(false)
  }

  const loadMembers = async () => {
    const res = await fetch('/api/orgs/members')
    const data = await res.json()
    if (res.ok) setMembers(data.members || [])
  }

  const loadInboundAddresses = async () => {
    const res = await fetch('/api/orgs/inbound-addresses')
    const data = await res.json()
    if (res.ok) setInboundList(data.entries || [])
  }

  const addInboundAddress = async () => {
    const v = inboundAddress.trim().toLowerCase()
    if (!v) return
    const res = await fetch('/api/orgs/inbound-addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_address: v }) })
    if (res.ok) {
      setInboundAddress('')
      await loadInboundAddresses()
    }
  }

  const loadAccounts = async () => {
    const res = await fetch('/api/orgs/accounts')
    const data = await res.json()
    if (res.ok) setAccounts(data.accounts || [])
  }

  const addAccount = async () => {
    const code = newAccountCode.trim()
    const label = newAccountLabel.trim()
    if (!code || !label) return
    const synonyms = newAccountSynonyms.split(',').map(s=>s.trim()).filter(Boolean)
    const res = await fetch('/api/orgs/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label, synonyms }) })
    if (res.ok) {
      setNewAccountCode(''); setNewAccountLabel(''); setNewAccountSynonyms('')
      await loadAccounts()
    }
  }

  const removeAccount = async (code: string) => {
    const res = await fetch(`/api/orgs/accounts?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
    if (res.ok) await loadAccounts()
  }

  const loadVatCodes = async () => {
    const res = await fetch('/api/orgs/vat')
    const data = await res.json()
    if (res.ok) setVatCodes(data.vatCodes || [])
  }

  const addVatCode = async () => {
    const code = newVatCode.trim()
    const label = newVatLabel.trim()
    const rate = Number(newVatRate.replace('%','').replace(',','.'))
    if (!code || !label || Number.isNaN(rate)) return
    const synonyms = newVatSynonyms.split(',').map(s=>s.trim()).filter(Boolean)
    const res = await fetch('/api/orgs/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label, rate, synonyms }) })
    if (res.ok) {
      setNewVatCode(''); setNewVatLabel(''); setNewVatRate('20'); setNewVatSynonyms('')
      await loadVatCodes()
    }
  }

  const removeVatCode = async (code: string) => {
    const res = await fetch(`/api/orgs/vat?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
    if (res.ok) await loadVatCodes()
  }

  const removeInbound = async (addr: string) => {
    const res = await fetch(`/api/orgs/inbound-addresses?full_address=${encodeURIComponent(addr)}`, { method: 'DELETE' })
    if (res.ok) await loadInboundAddresses()
  }

  useEffect(() => { load() }, [])

  const createOrg = async () => {
    if (!newOrgName.trim()) return
    const res = await fetch('/api/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newOrgName.trim() }) })
    if (res.ok) { setNewOrgName(''); await load() }
  }

  const switchOrg = async (orgId: string) => {
    const res = await fetch('/api/orgs/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organization_id: orgId }) })
    if (res.ok) { await load() }
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    const res = await fetch('/api/orgs/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail.trim() }) })
    if (res.ok) { 
      const data = await res.json().catch(() => ({}))
      setInviteEmail('')
      await loadMembers()
      if (data.warning) {
        alert(`Invitation créée mais ${data.warning.toLowerCase()}. Code: ${data.invite_code}`)
      } else {
        alert(`Invitation envoyée à ${inviteEmail.trim()} !`)
      }
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Erreur lors de l\'invitation')
    }
  }

  const removeMember = async (userId: string) => {
    const res = await fetch(`/api/orgs/members?user_id=${userId}`, { method: 'DELETE' })
    if (res.ok) await loadMembers()
  }

  if (loading) return <div className="max-w-4xl mx-auto p-6">Chargement…</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Organisation</h1>

      <section className="bg-white rounded border p-4">
        <h2 className="font-medium mb-3">Mes organisations</h2>
        <div className="space-y-2">
          {orgs.map((o) => (
            <div key={o.id} className="flex items-center justify-between border rounded px-3 py-2">
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-gray-500">{o.role}</div>
              </div>
              <button className={`text-sm px-2 py-1 rounded border ${activeOrgId===o.id ? 'bg-blue-50 border-blue-300' : ''}`} onClick={() => switchOrg(o.id)}>
                {activeOrgId===o.id ? 'Active' : 'Activer'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={newOrgName} onChange={(e)=>setNewOrgName(e.target.value)} placeholder="Nouvelle organisation" className="border rounded px-2 py-1 flex-1" />
          <button onClick={createOrg} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Créer</button>
        </div>
      </section>

      <section className="bg-white rounded border p-4">
        <h2 className="font-medium mb-3">Adresse(s) de réception</h2>
        <div className="text-sm text-gray-600 mb-2">Déclarez l'adresse complète qui reçoit les factures (ex: factures@client.tld). Les emails envoyés à cette adresse seront rattachés à l'organisation active.</div>
        <div className="flex gap-2">
          <input value={inboundAddress} onChange={(e)=>setInboundAddress(e.target.value)} placeholder="factures@client.tld" className="border rounded px-2 py-1 flex-1" />
          <button onClick={addInboundAddress} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Ajouter</button>
        </div>
        <div className="mt-4">
          {inboundList.length === 0 ? (
            <div className="text-sm text-gray-500">Aucune adresse déclarée.</div>
          ) : (
            <ul className="divide-y">
              {inboundList.map((e)=> (
                <li key={e.full_address} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-mono text-sm">{e.full_address}</span>
                    <span className="text-xs text-gray-500 ml-2">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-sm px-2 py-1 rounded border" onClick={()=>navigator.clipboard.writeText(e.full_address)}>Copier</button>
                    <button className="text-sm px-2 py-1 rounded border" onClick={()=>removeInbound(e.full_address)}>Supprimer</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white rounded border p-4">
        <h2 className="font-medium mb-3">Comptes comptables (organisation)</h2>
        <div className="text-sm text-gray-600 mb-2">Configurez vos comptes favoris. Ils apparaîtront dans la sélection des factures.</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={newAccountCode} onChange={(e)=>setNewAccountCode(e.target.value)} placeholder="Code (ex: 607)" className="border rounded px-2 py-1 w-32" />
          <input value={newAccountLabel} onChange={(e)=>setNewAccountLabel(e.target.value)} placeholder="Libellé" className="border rounded px-2 py-1 flex-1" />
          <input value={newAccountSynonyms} onChange={(e)=>setNewAccountSynonyms(e.target.value)} placeholder="Synonymes (séparés par des ,)" className="border rounded px-2 py-1 flex-1" />
          <button onClick={addAccount} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Ajouter</button>
        </div>
        <div className="mt-4">
          {accounts.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun compte configuré.</div>
          ) : (
            <ul className="divide-y">
              {accounts.map((a)=> (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-mono text-sm mr-2">{a.code}</span>
                    <span className="text-sm">{a.label}</span>
                    {a.synonyms && a.synonyms.length>0 && (
                      <span className="text-xs text-gray-500 ml-2">({a.synonyms.join(', ')})</span>
                    )}
                  </div>
                  <button className="text-sm px-2 py-1 rounded border" onClick={()=>removeAccount(a.code)}>Supprimer</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white rounded border p-4">
        <h2 className="font-medium mb-3">Codes TVA (organisation)</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={newVatCode} onChange={(e)=>setNewVatCode(e.target.value)} placeholder="Code (ex: 002)" className="border rounded px-2 py-1 w-28" />
          <input value={newVatLabel} onChange={(e)=>setNewVatLabel(e.target.value)} placeholder="Libellé" className="border rounded px-2 py-1 flex-1" />
          <input value={newVatRate} onChange={(e)=>setNewVatRate(e.target.value)} placeholder="Taux (%)" className="border rounded px-2 py-1 w-24" />
          <input value={newVatSynonyms} onChange={(e)=>setNewVatSynonyms(e.target.value)} placeholder="Synonymes (séparés par ,)" className="border rounded px-2 py-1 flex-1" />
          <button onClick={addVatCode} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Ajouter</button>
        </div>
        <div className="mt-4">
          {vatCodes.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun code TVA configuré.</div>
          ) : (
            <ul className="divide-y">
              {vatCodes.map((v)=> (
                <li key={v.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-mono text-sm mr-2">{v.code}</span>
                    <span className="text-sm">{v.label}</span>
                    <span className="text-xs text-gray-500 ml-2">({v.rate}%)</span>
                    {v.synonyms && v.synonyms.length>0 && (
                      <span className="text-xs text-gray-400 ml-2">{v.synonyms.join(', ')}</span>
                    )}
                  </div>
                  <button className="text-sm px-2 py-1 rounded border" onClick={()=>removeVatCode(v.code)}>Supprimer</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white rounded border p-4">
        <h2 className="font-medium mb-3">Membres</h2>
        <div className="space-y-2">
          {members.map((m)=> (
            <div key={m.user_id} className="flex items-center justify-between border rounded px-3 py-2">
              <div>
                <div className="font-medium">{m.full_name || m.email}</div>
                <div className="text-xs text-gray-500">{m.email}</div>
              </div>
              <button className="text-sm px-2 py-1 rounded border" onClick={()=>removeMember(m.user_id)}>Retirer</button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} placeholder="Inviter par email" className="border rounded px-2 py-1 flex-1" />
          <button onClick={inviteMember} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Inviter</button>
        </div>
      </section>
    </div>
  )
}


