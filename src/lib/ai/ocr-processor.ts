import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import { ExtractedInvoiceData } from '@/types/invoice'

export class OCRProcessor {
  private worker: Tesseract.Worker | null = null

  async initialize() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('fra+eng', 1, {
        logger: m => console.log(m)
      })
    }
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
      
      // Si pdf-parse renvoie du contenu, l'utiliser directement
      if (text && text.length > 30) {
        return [text]
      }
      
      // Sinon, tenter l'OCR sur le PDF scanné
      console.log('[OCR] pdf-parse vide, tentative OCR fallback...')
      const ocrTexts = await this.ocrPdfPages(pdfBuffer)
      console.log('[OCR] Fallback PDF OCR pages count:', ocrTexts.length)
      
      if (ocrTexts.length > 0) {
        return ocrTexts
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

  private async ocrPdfPages(pdfBuffer: Buffer): Promise<string[]> {
    try {
      console.log('[OCR] Tentative OCR sur PDF scanné via pdf-to-png + Tesseract')
      
      // Convertir première page PDF → PNG via pdf-to-png
      const { pdfToPng } = require('pdf-to-png-converter')
      const pngPages = await pdfToPng(pdfBuffer, {
        disableFontFace: false,
        useSystemFonts: false,
        viewportScale: 2.0,
        outputFolder: undefined, // En mémoire
        strictPagesToProcess: false,
        verbosityLevel: 0,
        pagesToProcess: [1, 2] // Première et deuxième page max
      })
      
      console.log(`[OCR] ${pngPages.length} pages PNG générées`)
      
      if (!pngPages || pngPages.length === 0) {
        console.warn('[OCR] Aucune page PNG générée')
        return []
      }
      
      // OCR sur chaque page PNG avec test de rotation
      await this.initialize()
      const pageTexts: string[] = []
      
      for (let i = 0; i < Math.min(pngPages.length, 2); i++) {
        const page = pngPages[i]
        console.log(`[OCR] Traitement page ${i + 1}, taille: ${page.content?.length || 0} bytes`)
        
        if (!page.content) continue
        
        // Tester plusieurs rotations et garder la meilleure
        const rotations = [0, 90, 180, 270]
        let bestText = ''
        let bestRotation = 0
        
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
            
            if (cleanText.length > bestText.length) {
              bestText = cleanText
              bestRotation = angle
            }
            
            // Si on a trouvé un bon résultat, pas besoin de tester toutes les rotations
            if (cleanText.length > 500) break
          } catch (err) {
            console.warn(`[OCR] Erreur rotation ${angle}°:`, err)
          }
        }
        
        console.log(`[OCR] Page ${i + 1} meilleure rotation: ${bestRotation}°, texte extrait (taille): ${bestText.length}`)
        console.log(`[OCR] Aperçu texte page ${i + 1}:`, bestText.substring(0, 300))
        
        if (bestText && bestText.length > 10) {
          pageTexts.push(bestText)
        }
      }
      
      console.log(`[OCR] Total pages OCR réussies: ${pageTexts.length}`)
      return pageTexts
    } catch (e) {
      console.warn('OCR PDF fallback échec:', e)
      return []
    }
  }
}
