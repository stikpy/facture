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
      
      // Extraire le texte
      const { data: { text } } = await this.worker.recognize(optimizedBuffer)
      
      return text
    } catch (error) {
      console.error('Erreur OCR:', error)
      throw new Error('Impossible d\'extraire le texte de l\'image')
    }
  }

  private async optimizeImageForOCR(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
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
      if (text && text.length > 30) {
        return [text]
      }

      // Fallback OCR: rendre les 2-3 premières pages en images puis OCR
      const ocrTexts = await this.ocrPdfPages(pdfBuffer)
      if (ocrTexts.length > 0) return ocrTexts
      return [text] // même si vide, pour éviter throw
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
      // Importer dynamiquement pour éviter erreurs d'env si non dispo
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
      // Utiliser OffscreenCanvas si disponible (Edge runtime) sinon désactiver fallback
      const CanvasImpl: any = (global as any).OffscreenCanvas || null
      if (!CanvasImpl) {
        console.warn('OffscreenCanvas indisponible - OCR PDF fallback désactivé')
        return []
      }

      // Canvas factory pour pdfjs sous Node
      class NodeCanvasFactory {
        create(width: number, height: number) {
          const canvas = new CanvasImpl(width, height)
          const context = canvas.getContext('2d')
          return { canvas, context }
        }
        reset(canvasAndContext: any, width: number, height: number) {
          canvasAndContext.canvas.width = width
          canvasAndContext.canvas.height = height
        }
        destroy(canvasAndContext: any) {
          canvasAndContext.canvas.width = 0
          canvasAndContext.canvas.height = 0
          // @ts-ignore
          canvasAndContext.canvas = null
          // @ts-ignore
          canvasAndContext.context = null
        }
      }

      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer })
      const doc = await loadingTask.promise
      const maxPages = Math.min(doc.numPages, Number(process.env.OCR_PDF_MAX_PAGES || 2))

      await this.initialize()
      const pageTexts: string[] = []

      for (let p = 1; p <= maxPages; p++) {
        const page = await doc.getPage(p)
        const viewport = page.getViewport({ scale: 2.0 })
        const factory = new NodeCanvasFactory()
        const { canvas, context } = factory.create(viewport.width, viewport.height)
        const renderContext = {
          canvasContext: context,
          viewport,
          canvasFactory: factory,
        }
        await page.render(renderContext as any).promise
        const blob = await canvas.convertToBlob?.({ type: 'image/png' })
        const arrayBuffer = blob ? await blob.arrayBuffer() : new ArrayBuffer(0)
        const pngBuffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer))
        // OCR sur l'image rendue
        if (!this.worker) await this.initialize()
        const optimized = await this.optimizeImageForOCR(pngBuffer)
        const { data: { text } } = await (this.worker as Tesseract.Worker).recognize(optimized)
        const t = String(text || '').trim()
        if (t) pageTexts.push(t)
        factory.destroy({ canvas, context })
      }
      return pageTexts
    } catch (e) {
      console.warn('OCR PDF fallback échec:', e)
      return []
    }
  }
}
