import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

// Affichage uniforme des noms (Title Case FR avec gestion tirets)
export function formatTitleCaseName(name: string): string {
  if (!name) return ''
  const keepUpper = new Set(['SAS', 'SASU', 'SARL', 'SA', 'EURL', 'SPA', 'LTD', 'INC'])
  const lower = String(name).toLocaleLowerCase('fr-FR').trim()
  const words = lower.split(/\s+/)
  const up = words.map((w) => {
    // garder les abréviations connues en majuscules
    const raw = w.toUpperCase()
    if (keepUpper.has(raw)) return raw
    // gérer les mots composés avec tirets
    return w.split('-').map(part => part ? part[0].toLocaleUpperCase('fr-FR') + part.slice(1) : part).join('-')
  })
  return up.join(' ')
}
