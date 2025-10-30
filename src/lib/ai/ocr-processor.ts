import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import { ExtractedInvoiceData } from '@/types/invoice'

export class OCRProcessor {
  private worker: Tesseract.Worker | null = null
  private lastAlternatives: Array<{rotation: number, score: number, text: string}> = []

  async initialize() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('fra+eng', 1, {
        logger: m => console.log(m)
      })
    }
  }

  getAlternativeRotations(): Array<{rotation: number, score: number, text: string}> {
    return this.lastAlternatives
  }

  async processImage(imageBuffer: Buffer): Promise<string> {
    try {
      await this.initialize()
      
      if (!this.worker) {
        throw new Error('Worker OCR non initialisé')
      }

      // Optimiser l'image pour l'OCR
      const optimizedBuffer = await this.optimizeImageForOCR(imageBuffer)
      console.log('[OCR] Image optimisée (bytes):', optimizedBuffer?.length)
      
      // Extraire le texte
      const { data: { text } } = await this.worker.recognize(optimizedBuffer)
      console.log('[OCR] Texte image (taille):', String(text||'').length)
      
      return text
    } catch (error) {
      console.error('Erreur OCR:', error)
      throw new Error('Impossible d\'extraire le texte de l\'image')
    }
  }

  private async optimizeImageForOCR(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .rotate() // Auto-rotation basée sur EXIF orientation
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer()
    } catch (error) {
      console.error('Erreur optimisation image:', error)
      return buffer
    }
  }

  async processPDF(pdfBuffer: Buffer): Promise<string[]> {
    try {
      const pdf = require('pdf-parse')
      const data = await pdf(pdfBuffer)
      
      // Pour les PDF avec images, on pourrait ajouter l'extraction d'images
      // et les traiter avec l'OCR
      const text = String(data?.text || '').trim()
      console.log('[OCR] pdf-parse texte (taille):', text.length)
      const numPages = Number((data as any)?.numpages || 0)
      console.log('[OCR] pdf-parse pages:', numPages)
      
      // Si pdf-parse renvoie du contenu (même multi‑pages), l'utiliser directement
      if (text && text.length > 30) return [text]

      // Sinon, tenter l'OCR sur le PDF scanné (fallback lourd)
      console.log('[OCR] pdf-parse vide, tentative OCR fallback...')
      const ocrResult = await this.ocrPdfPages(pdfBuffer, numPages || undefined)
      console.log('[OCR] Fallback PDF OCR pages count:', ocrResult.texts.length)
      
      // Stocker les rotations alternatives pour fallback si extraction échoue
      this.lastAlternatives = ocrResult.alternativeRotations || []
      if (this.lastAlternatives.length > 0) {
        console.log('[OCR] Rotations alternatives disponibles:', this.lastAlternatives.map(r => `${r.rotation}° (score: ${r.score})`).join(', '))
      }
      
      if (ocrResult.texts.length > 0) {
        return ocrResult.texts
      }
      
      // Si échec complet, retourner vide
      return [text]
    } catch (error) {
      console.error('Erreur traitement PDF:', error)
      throw new Error('Impossible de traiter le PDF')
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }

  private async ocrPdfPages(pdfBuffer: Buffer, numPagesHint?: number): Promise<{ texts: string[], alternativeRotations?: Array<{rotation: number, score: number, text: string}> }> {
    try {
      console.log('[OCR] Tentative OCR sur PDF scanné via sharp -> PNG + Tesseract')

      // Rasteriser les pages PDF avec sharp (évite pdfjs worker)
      const pngPages: Array<{ content: Buffer }> = []
      const maxPages = Math.min(numPagesHint || 4, 12)
      for (let i = 0; i < maxPages; i++) {
        try {
          const pagePng = await sharp(pdfBuffer, { density: 260, page: i })
            .png()
            .toBuffer()
          if (pagePng && pagePng.length > 0) pngPages.push({ content: pagePng })
        } catch (e) {
          if (i === 0) {
            console.warn('[OCR] sharp rasterize page 0 failed:', e)
          }
          break // stop if we cannot rasterize further pages
        }
      }

      console.log(`[OCR] ${pngPages.length} pages PNG générées (sharp)`)      
      if (!pngPages.length) return { texts: [] }
      
      // OCR sur chaque page PNG avec test de rotation
      await this.initialize()
      const pageTexts: string[] = []
      const allRotationResults: Array<{rotation: number, score: number, text: string}> = []
      
      const cap = Math.min(pngPages.length, 12) // Cap de sécurité
      for (let i = 0; i < cap; i++) {
        const page = pngPages[i]
        console.log(`[OCR] Traitement page ${i + 1}, taille: ${page.content?.length || 0} bytes`)
        
        if (!page.content) continue
        
        // Détecter l'orientation du PDF via dimensions
        const metadata = await sharp(page.content).metadata()
        const isLandscape = metadata.width && metadata.height && metadata.width > metadata.height
        
        console.log(`[OCR] Dimensions: ${metadata.width}x${metadata.height}, format: ${isLandscape ? 'paysage' : 'portrait'}`)
        
        // TOUJOURS tester toutes les rotations pour trouver la meilleure
        const rotations = [0, 90, 180, 270]
        const rotationResults: Array<{rotation: number, score: number, text: string}> = []
        let bestText = ''
        let bestRotation = 0
        let bestScore = 0
        
        console.log(`[OCR] Test des rotations pour trouver la meilleure qualité (arrêt si score excellent)`)
        
        for (const angle of rotations) {
          try {
            const rotated = await sharp(page.content)
              .rotate(angle)
              .greyscale()
              .normalize()
              .sharpen()
              .png()
              .toBuffer()
            
            if (!this.worker) await this.initialize()
            const { data: { text } } = await (this.worker as any).recognize(rotated)
            const cleanText = String(text || '').trim()
            
            // Score basé sur : longueur + nombre de mots valides (>2 chars) - pénalité pour symboles
            const words = cleanText.split(/\s+/).filter(w => w.length > 2 && /^[a-zA-ZÀ-ÿ0-9]+$/.test(w))
            const symbols = (cleanText.match(/[£€@#%&*=|]/g) || []).length
            const score = cleanText.length + (words.length * 20) - (symbols * 5)
            
            console.log(`[OCR]   → ${angle}°: ${cleanText.length} chars, ${words.length} mots valides, ${symbols} symboles, score=${score}`)
            
            // Stocker tous les résultats de rotation
            rotationResults.push({ rotation: angle, score, text: cleanText })
            
            if (score > bestScore) {
              bestText = cleanText
              bestRotation = angle
              bestScore = score
            }
            
            // Si score excellent (beaucoup de mots valides, peu de symboles), arrêter
            if (words.length > 50 && symbols < 10 && score > 1500) {
              console.log(`[OCR]   ✓ Score excellent (${score}), arrêt des tests`)
              break
            }
          } catch (err) {
            console.warn(`[OCR] Erreur rotation ${angle}°:`, err)
          }
        }
        
        console.log(`[OCR] ✅ Meilleure rotation: ${bestRotation}°, score: ${bestScore}, texte (taille): ${bestText.length}`)
        console.log(`[OCR] Aperçu texte page ${i + 1}:`, bestText.substring(0, 400))
        
        if (bestText && bestText.length > 10) {
          pageTexts.push(bestText)
        }
        
        // Garder les rotations alternatives (triées par score décroissant, exclure la meilleure)
        const alternatives = rotationResults
          .filter(r => r.rotation !== bestRotation && r.text.length > 10)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2) // Garder max 2 alternatives
        
        allRotationResults.push(...alternatives)
      }
      
      console.log(`[OCR] Total pages OCR réussies: ${pageTexts.length}`)
      return { 
        texts: pageTexts,
        alternativeRotations: allRotationResults.length > 0 ? allRotationResults : undefined
      }
    } catch (e) {
      console.warn('OCR PDF fallback échec:', e)
      return { texts: [] }
    }
  }
}
