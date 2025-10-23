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

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/orgs')
    const data = await res.json()
    if (res.ok) {
      setOrgs(data.organizations || [])
      setActiveOrgId(data.activeOrganizationId || null)
    }
    await loadInboundAddresses()
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
    if (res.ok) { setInviteEmail(''); await loadMembers() }
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


