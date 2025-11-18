import { ChatOpenAI } from '@langchain/openai'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ExtractedInvoiceData, InvoiceClassification } from '@/types/invoice'
import { extractTokenUsageFromResponse, TokenUsage } from '@/lib/token-usage'

export interface ProcessingResult {
  data: ExtractedInvoiceData
  tokenUsage?: TokenUsage
}

export class DocumentProcessor {
  private llm: ChatOpenAI
  private embeddings: OpenAIEmbeddings
  private vectorStore: MemoryVectorStore

  constructor(organizationId?: string) {
    // Utiliser la clé API spécifique pour les autres organisations
    const PRIMARY_ORG_ID = '0c7de2b1-1550-4569-9bed-8544ae4d3651'
    const apiKey = organizationId && organizationId !== PRIMARY_ORG_ID
      ? (process.env.OPENAI_API_KEY_OTHER_ORGS || process.env.OPENAI_API_KEY)
      : process.env.OPENAI_API_KEY

    this.llm = new ChatOpenAI({
      modelName: 'gpt-5-mini',
      openAIApiKey: apiKey,
    })
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
    })
    
    this.vectorStore = new MemoryVectorStore(this.embeddings)
  }

  async processDocument(text: string, fileName: string): Promise<ExtractedInvoiceData> {
    try {
      const normalizeList = (value: unknown): string[] => {
        if (!value) return []
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean)
        const raw = String(value)
        if (!raw.trim()) return []
        return raw
          .split(/[,;\n]+/)
          .map(part => part.trim())
          .filter(Boolean)
      }

      const sanitizeToJson = (raw: any): any => {
        // Normaliser la sortie du modèle vers une chaîne
        let s = typeof raw === 'string'
          ? raw
          : typeof raw?.answer === 'string'
            ? raw.answer
            : typeof raw?.content === 'string'
              ? raw.content
              : String(raw ?? '')

        // Retirer les fences de code ```json ... ``` si présents
        const fenced = s.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
        if (fenced && fenced[1]) {
          s = fenced[1]
        }

        s = s.trim()

        // Si la chaîne ne commence/termine pas par des accolades, extraire le premier bloc JSON plausible
        if (!(s.startsWith('{') && s.endsWith('}'))) {
          const braceStart = s.indexOf('{')
          const braceEnd = s.lastIndexOf('}')
          if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
            s = s.substring(braceStart, braceEnd + 1)
          }
        }

        return JSON.parse(s)
      }

      // Diviser le document en chunks plus grands pour préserver les tableaux d'articles
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000, // Chunks plus grands pour capturer les tableaux complets
        chunkOverlap: 400, // Plus de chevauchement pour ne pas perdre de contexte
        separators: ['\n\n', '\n', '. ', ' ', ''], // Préserver les sauts de ligne pour les tableaux
      })
      
      const docs = await splitter.createDocuments([text])
      
      // Ajouter les documents au vector store
      await this.vectorStore.addDocuments(docs)
      
      // Créer la chaîne de récupération avec plus de documents pour capturer les tableaux complets
      const retriever = this.vectorStore.asRetriever({ k: 10 }) // Récupérer plus de chunks pour avoir le contexte complet
      
      // Template pour l'extraction de données
      const prompt = ChatPromptTemplate.fromTemplate(`
        Vous êtes un expert en extraction de documents comptables (factures, bons de livraison, avoirs...).
        Analysez le texte suivant et extrayez toutes les informations pertinentes.

        RÈGLES CRITIQUES D'IDENTIFICATION (À RESPECTER ABSOLUMENT):

        1. FOURNISSEUR (supplier) = Entreprise qui VEND et ENVOIE la facture
           - Apparaît TOUJOURS en haut du document (zone "émetteur")
           - Son SIRET/SIREN/TVA est en HAUT de la facture
           - C'est l'entreprise qui sera PAYÉE
           - Exemples de sections: "Fournisseur:", "De:", "Émetteur:", ou directement en en-tête
        
        2. CLIENT = Entreprise qui ACHÈTE et REÇOIT la facture  
           - Apparaît dans la zone "destinataire" (milieu ou bas de page)
           - Sous les mentions: "Facturé à:", "Client:", "Destinataire:", "Livré à:"
           - C'est l'entreprise qui doit PAYER
        
        3. DATES: La date de FACTURE est celle indiquée dans l'en-tête "FACTURE" (cadre contenant "Date | N° | Code Client"). Ne JAMAIS prendre la date du bon de livraison ou de commande.

        4. TYPE DE DOCUMENT (document_type):
           - "invoice" : mentions "FACTURE" ou "FACTURE N°" clairement, contient montants HT/TVA/total.
           - "delivery_note" : mentions "BON DE LIVRAISON", "BL", "BON N°", avec détails de livraison et souvent signature.
           - "credit_note" : mentions "AVOIR" ou "NOTE DE CREDIT".
           - "quote" : mentions "DEVIS" ou "PROPOSITION".
           - "other" : tout autre document.
           Utilisez exactement ces valeurs en minuscules.

        5. VÉRIFICATIONS:
           - Si supplier_name = client_name → ERREUR! Relisez attentivement le document
           - Le nom du fichier peut contenir un indice sur le fournisseur
           - Cherchez les RIB/IBAN → ils appartiennent au FOURNISSEUR (qui reçoit le paiement)
           - Si incertain pour l'adresse/TVA du fournisseur, LAISSEZ CES CHAMPS VIDES

        6. RAPPROCHEMENT FACTURE / BON DE LIVRAISON:
           - Identifiez tous les numéros de bon de livraison associés à la facture (souvent "Bon de livraison", "BL", "Bon n°").
           - Identifiez tous les numéros de facture associés à un bon de livraison.
           - Conservez l'ordre et la casse originale des références, mais supprimez les espaces inutiles.

        Contexte: {context}

        Extrayez les informations suivantes au format JSON:
        {{
          "invoice_number": "numéro de facture",
          "invoice_date": "date de facture (YYYY-MM-DD)",
          "due_date": "date d'échéance (YYYY-MM-DD)",
          "total_amount": montant_total_numerique,
          "tax_amount": montant_tva_numerique,
          "subtotal": sous_total_numerique,
          "document_type": "invoice|delivery_note|credit_note|quote|other",
          "document_reference": "référence principale du document (numéro de facture, BL, avoir, etc.)",
          "delivery_note_number": "numéro du bon de livraison si présent",
          "related_delivery_note_numbers": ["liste des numéros de bons de livraison associés"],
          "related_invoice_numbers": ["liste des numéros de factures associées"],
          "supplier_name": "nom EXACT et COMPLET du fournisseur (ZONE ÉMETTEUR en haut du document)",
          "supplier_address": "adresse complète du fournisseur (laisser vide si incertain)",
          "supplier_email": "email du fournisseur",
          "supplier_phone": "téléphone du fournisseur",
          "supplier_vat_number": "numéro TVA/SIRET du fournisseur (laisser vide si incertain)",
          "client_name": "nom EXACT du client (ZONE DESTINATAIRE, mention 'Facturé à')",
          "client_address": "adresse complète du client",
          "client_email": "email du client",
          "client_phone": "téléphone du client",
          "client_vat_number": "numéro TVA/SIRET du client",
          "items": [
            {{
              "description": "description de l'article",
              "quantity": quantite_numerique,
              "unit_price": prix_unitaire_numerique,
              "total_price": prix_total_numerique,
              "tax_rate": taux_tva_numerique,
              "is_ht": true_ou_false,
              "reference": "code_reference_produit"
            }}
          ],
          "currency": "devise (EUR, USD, etc.)",
          "payment_terms": "conditions de paiement",
          "notes": "notes additionnelles"
        }}

        ⚠️⚠️⚠️ CRITIQUE - EXTRACTION EXHAUSTIVE DES ARTICLES (PRIORITÉ ABSOLUE - NE PAS IGNORER) ⚠️⚠️⚠️:
        
        Le document contient probablement un TABLEAU D'ARTICLES avec des colonnes comme:
        - Désignation / Description / Libellé
        - Référence / Code / Réf
        - Qte / Quantité / Qte fact.
        - Prix Unitaire / PU
        - Montant HT / HT
        - TVA / Taux
        
        EXEMPLE DE TABLEAU À EXTRAIRE:
        Si vous voyez dans le texte des lignes comme:
        "CREME D AMANDES POCHE 1KG | 018422 | 2 | 13,156 | 26,31 | 1"
        "MINI JESUITE | 022209 | 1 | 28,339 | 28,34 | 1"
        "TRANSPORT | | | | 18,00 | 20"
        
        → Ce sont des ARTICLES RÉELS à extraire, PAS un seul "Total facture"!
        
        ÉTAPE 1 - RECHERCHE OBLIGATOIRE ET EXHAUSTIVE:
        1. Cherchez TOUS les mots suivants dans le texte: "Désignation", "Référence", "Qte", "Prix Unitaire", "Montant HT", "TVA", "Description", "Libellé", "Col", "Pièces", "UV"
        2. Si vous trouvez ces mots, il y a un TABLEAU d'articles à extraire
        3. Identifiez TOUTES les lignes qui suivent ces en-têtes, MÊME celles en bas du tableau
        4. Chaque ligne avec une description de produit/service est un ARTICLE, même si certaines colonnes sont vides
        5. Ne vous arrêtez PAS avant d'avoir extrait TOUS les articles jusqu'à la ligne "TOTAL" ou "SOUS-TOTAL"
        
        ÉTAPE 2 - EXTRACTION LIGNE PAR LIGNE (EXHAUSTIVE):
        Pour CHAQUE ligne du tableau trouvée (du début jusqu'à la ligne de total):
        - description: le texte dans la colonne "Désignation" (ex: "CREME D AMANDES POCHE 1KG", "MINI JESUITE", "CAKE PISTACHE", "CREME ANGLAISE", "LAIT DEMI ECREME")
        - reference: la valeur dans la colonne "Référence", "Réf", "Code", "Code produit" (ex: "018422", "022209", "025051") - CONSERVER tel quel, même si c'est un nombre
        - quantity: la valeur dans la colonne "Qte", "Quantité", "Qte fact.", "Pièces" (convertir en nombre, utiliser 1 si absent)
        - unit_price: la valeur dans "Prix Unitaire" ou "PU" (convertir en nombre décimal, peut être calculé si absent)
        - total_price: la valeur dans "Montant HT" ou "Montant TTC" ou "TTC" (convertir en nombre décimal, PRIORITÉ sur cette valeur)
        - tax_rate: le taux de TVA (peut être dans une colonne séparée, ou déduit du total HT/TTC)
        - is_ht: TRUE si la colonne s'appelle "Montant HT", "HT", "Hors Taxe" → le total_price est HT. FALSE si la colonne s'appelle "Montant TTC", "TTC", "Toutes Taxes Comprises" → le total_price est TTC. Par défaut TRUE si incertain.
        
        ⚠️ CRITIQUE - IDENTIFICATION HT/TTC:
        - Si vous voyez une colonne "Montant HT" → is_ht = true, total_price = valeur de cette colonne (DÉJÀ HT, ne pas retirer la TVA!)
        - Si vous voyez une colonne "Montant TTC" ou "TTC" → is_ht = false, total_price = valeur de cette colonne (DÉJÀ TTC)
        - Si vous voyez les deux colonnes, utilisez "Montant HT" pour total_price et is_ht = true
        - Si aucune indication claire, assumez is_ht = true (montant HT par défaut)
        
        ⚠️ IMPORTANT: Si une ligne a un "Montant HT" mais pas de "Prix Unitaire", calculez-le: unit_price = total_price / quantity
        
        EXEMPLE CONCRET D'EXTRACTION COMPLÈTE:
        Si vous voyez:
        "CREME D AMANDES POCHE 1KG | 018422 | 2 | 13,156 | 26,31 | 1"
        "MINI JESUITE | 022209 | 1 | 28,339 | 28,34 | 1"
        "MINI BROWNIES | ... | ... | ... | 43,68 | ..."
        "MOELLEUX CHOCOLAT DIAM 260 | ... | ... | ... | 134,20 | ..."
        "1/2 CADRE SPECULOOS 2100 G 1 PCE | ... | ... | ... | 51,55 | ..."
        "CAKE CITRON CUIT | ... | ... | ... | 25,09 | ..."
        "CAKE MARBRE CUIT | ... | ... | ... | 44,46 | ..."
        "CAKE PAIN D EPICES CUIT 460G | ... | ... | ... | 22,76 | ..."
        "BAGUETTE FLEUR DE SOLENE PRECUITE 280G | ... | ... | ... | 26,82 | ..."
        "TARTELETTE CROUSTILLANTE AUX POMMES D 105 CRU 130G | ... | ... | ... | 40,33 | ..."
        "CAKE PISTACHE GRAINES CHIA AMANDES SECRETS DU FOURNIL CUIT 1KG | ... | ... | ... | 48,62 | ..."
        "PETIT PAIN LOSANGE DU FOURNIL NATURE | ... | ... | ... | 68,66 | ..."
        "CREME ANGLAISE VANILLE BOURBON PRESIDENT 1L | ... | ... | ... | 15,96 | ..."
        "CREME UHT SPECIAL CUISSON 18% MG 6X1L | ... | ... | ... | 24,54 | ..."
        "LAIT DEMI ECREME UHT ORIGINE FRANCE 6X1L | ... | ... | ... | 11,29 | ..."
        
        → Extrayez TOUS ces articles individuellement! Ne vous arrêtez PAS avant d'avoir extrait la dernière ligne!
        
        ÉTAPE 3 - VALIDATION STRICTE ET COMPTAGE:
        AVANT de créer "Total facture", vous DEVEZ vérifier:
        ✓ Le texte contient-il le mot "Désignation" ou "Description"?
        ✓ Y a-t-il des noms de produits (ex: "CREME", "MINI", "CAKE", "BAGUETTE", "TRANSPORT", "LAIT", "ANGLAISE")?
        ✓ Y a-t-il plusieurs nombres décimaux différents (pas juste un total)?
        ✓ Y a-t-il des références de produits (codes numériques)?
        ✓ Comptez le nombre de lignes avec des descriptions de produits - c'est le nombre MINIMUM d'articles à extraire
        
        Si OUI à l'une de ces questions → EXTRAIRE TOUS LES ARTICLES RÉELS, PAS "Total facture"!
        
        ÉTAPE 4 - FALLBACK INTERDIT SI ARTICLES TROUVÉS:
        NE CRÉEZ JAMAIS "Total facture" si:
        - Vous voyez des descriptions de produits (même une seule)
        - Vous voyez un tableau avec des colonnes
        - Vous voyez des références de produits
        - Le total calculé depuis les articles ne correspond pas au total extrait (cela signifie qu'il manque des articles!)
        
        Créez "Total facture" UNIQUEMENT si:
        - Le document ne contient QUE des totaux (TOTAL HT, TOTAL TVA, TOTAL TTC)
        - Aucune ligne de détail n'existe
        - Aucun nom de produit/service n'est mentionné
        
        ⚠️ RÈGLE ABSOLUE #1: Si le texte contient des descriptions de produits/services, extrayez-les comme articles individuels, même s'il n'y a qu'un seul article!
        
        ⚠️ RÈGLE ABSOLUE #2: Vérifiez que la SOMME des total_price des articles extraits correspond au total_amount. Si ce n'est pas le cas, il manque des articles - continuez à chercher et extraire!
        
        ⚠️ RÈGLE ABSOLUE #3: Ne vous arrêtez PAS à la première ligne de total. Extrayez TOUS les articles jusqu'à ce que vous atteigniez la ligne "TOTAL HT" ou "SOUS-TOTAL HT"!
        
        ⚠️ VALIDATION FINALE: Vérifiez que supplier_name ≠ client_name avant de répondre!
        Répondez uniquement avec le JSON valide, sans texte supplémentaire.
      `)
      
      const documentChain = await createStuffDocumentsChain({
        llm: this.llm,
        prompt,
      })
      
      const retrievalChain = await createRetrievalChain({
        combineDocsChain: documentChain,
        retriever,
      })

      // Passer aussi un résumé du texte complet pour aider l'IA à identifier les tableaux
      const textPreview = text.substring(0, 8000) // Premiers 8000 caractères pour identifier la structure et voir plus de lignes
      const hasTableKeywords = /(Désignation|Référence|Qte|Prix Unitaire|Montant HT|TVA|Description|Libellé|Col|Pièces|UV)/i.test(text)
      const itemCount = (text.match(/\d+[.,]\d{2,3}/g) || []).length // Compter les montants pour estimer le nombre d'articles
      const productKeywords = /(CREME|MINI|CAKE|BAGUETTE|TARTELETTE|PETIT PAIN|LAIT|ANGLAISE|UHT|MOELLEUX|CADRE|SPECULOOS|PISTACHE|LOSANGE|FOURNIL)/i.test(text)
      
      // Compter approximativement le nombre de lignes avec des descriptions de produits
      const productLines = (text.match(/[A-Z][A-Z\s\/\d]+(?:\s+\d+[.,]\d+){2,}/g) || []).length
      
      const result = await retrievalChain.invoke({
        input: `Extrayez toutes les données de cette facture: ${fileName}
        
${hasTableKeywords ? '🚨 CRITIQUE: Ce document contient un tableau d\'articles avec des colonnes (Désignation, Référence, Qte, Prix Unitaire, Montant HT, TVA, etc.). Vous DEVEZ extraire CHAQUE ligne du tableau comme un article séparé, PAS un seul "Total facture"! Extrayez TOUS les articles jusqu\'à la ligne "TOTAL HT" ou "SOUS-TOTAL HT"!' : ''}
${itemCount > 5 ? `🚨 CRITIQUE: Ce document contient ${itemCount} montants différents, ce qui indique clairement plusieurs articles (minimum ${Math.floor(itemCount / 2)} articles). Extrayez-les TOUS individuellement, ne vous arrêtez pas avant d'avoir extrait tous les articles!` : ''}
${productKeywords ? '🚨 CRITIQUE: Ce document contient des noms de produits (CREME, MINI, CAKE, BAGUETTE, LAIT, etc.). Chaque nom de produit est un article séparé à extraire. Ne créez JAMAIS un seul "Total facture" si vous voyez des noms de produits!' : ''}
${productLines > 0 ? `🚨 CRITIQUE: J'ai détecté environ ${productLines} lignes avec des descriptions de produits. Vous DEVEZ extraire TOUS ces articles individuellement. Le nombre minimum d'articles attendus est ${productLines}.` : ''}

⚠️ VALIDATION OBLIGATOIRE: Après extraction, vérifiez que la SOMME des total_price des articles extraits correspond au total_amount. Si ce n'est pas le cas, il manque des articles - relisez le document et extrayez-les!

Aperçu du document (structure et début du tableau):
${textPreview}${text.length > 8000 ? '...\n\n[Le document continue - assurez-vous d\'extraire TOUS les articles, même ceux en bas du tableau]' : ''}`,
      })

      // Extraire les tokens depuis la réponse
      const tokenUsage = extractTokenUsageFromResponse(result)

      // Parser le JSON retourné (tolérant aux fences et au texte annexe)
      const extractedData = sanitizeToJson(result) as ExtractedInvoiceData

      const normalizedData: ExtractedInvoiceData = {
        ...extractedData,
        related_delivery_note_numbers: normalizeList((extractedData as any)?.related_delivery_note_numbers),
        related_invoice_numbers: normalizeList((extractedData as any)?.related_invoice_numbers),
      }

      if (!normalizedData.document_type) {
        normalizedData.document_type = 'invoice'
      }

      // Validation post-extraction: vérifier que tous les articles ont été extraits
      if (normalizedData.items && Array.isArray(normalizedData.items) && normalizedData.items.length > 0) {
        const itemsSum = normalizedData.items.reduce((sum, item) => {
          return sum + (Number(item.total_price) || 0)
        }, 0)
        
        const expectedTotal = Number(normalizedData.total_amount) || 0
        const difference = Math.abs(itemsSum - expectedTotal)
        
        // Si la différence est significative (> 1€), il manque probablement des articles
        if (expectedTotal > 0 && difference > 1) {
          const missingPercentage = ((difference / expectedTotal) * 100).toFixed(1)
          console.warn(`[EXTRACTION] ⚠️ ATTENTION: La somme des articles extraits (${itemsSum.toFixed(2)} €) ne correspond pas au total de la facture (${expectedTotal.toFixed(2)} €). Différence: ${difference.toFixed(2)} € (${missingPercentage}%). Il manque probablement des articles dans l'extraction.`)
          
          // Ajouter un avertissement dans les notes
          const warning = `⚠️ ATTENTION: Extraction incomplète détectée. Somme des articles: ${itemsSum.toFixed(2)} €, Total facture: ${expectedTotal.toFixed(2)} €. Il manque ${difference.toFixed(2)} € (${missingPercentage}%). Veuillez relancer l'extraction.`
          normalizedData.notes = normalizedData.notes 
            ? `${normalizedData.notes}\n\n${warning}`
            : warning
        } else if (difference > 0.01) {
          // Différence mineure (< 1€ mais > 0.01€) - probablement un arrondi
          console.log(`[EXTRACTION] Différence mineure détectée: ${difference.toFixed(2)} € (probablement un arrondi)`)
        }
      }

      // Retourner les données avec les tokens si disponibles
      // Note: Pour compatibilité avec le code existant, on retourne directement les données
      // mais on stocke les tokens dans une propriété cachée
      ;(normalizedData as any).__tokenUsage = tokenUsage

      return normalizedData

    } catch (error: any) {
      console.error('Erreur lors du traitement du document:', error)
      
      // Détecter les erreurs de quota (429)
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
        const quotaError = new Error('Quota OpenAI dépassé. Veuillez réessayer plus tard ou vérifier votre plan OpenAI.')
        ;(quotaError as any).isQuotaError = true
        ;(quotaError as any).statusCode = 429
        throw quotaError
      }
      
      throw new Error('Impossible de traiter le document')
    }
  }

  async classifyInvoice(data: ExtractedInvoiceData): Promise<InvoiceClassification> {
    try {
      const sanitizeToJson = (raw: any): any => {
        let s = typeof raw === 'string'
          ? raw
          : typeof raw?.content === 'string'
            ? raw.content
            : String(raw ?? '')
        const fenced = s.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
        if (fenced && fenced[1]) s = fenced[1]
        s = s.trim()
        if (!(s.startsWith('{') && s.endsWith('}'))) {
          const b1 = s.indexOf('{'); const b2 = s.lastIndexOf('}')
          if (b1 !== -1 && b2 !== -1 && b2 > b1) s = s.substring(b1, b2 + 1)
        }
        return JSON.parse(s)
      }

      const prompt = ChatPromptTemplate.fromTemplate(`
        Analysez les données de facture suivantes et classifiez-les.
        
        Données: {data}
        
        Retournez un JSON avec:
        {{
          "category": "expense|income|tax|other",
          "subcategory": "sous-catégorie spécifique",
          "confidence": score_de_confiance_0_1,
          "tags": ["tag1", "tag2", "tag3"]
        }}
      `)
      
      const chain = prompt.pipe(this.llm)
      
      const result = await chain.invoke({
        data: JSON.stringify(data, null, 2),
      })

      // Extraire les tokens depuis la réponse
      const tokenUsage = extractTokenUsageFromResponse(result)
      if (tokenUsage) {
        ;(result as any).__tokenUsage = tokenUsage
      }
      
      return sanitizeToJson(result) as InvoiceClassification
      
    } catch (error) {
      console.error('Erreur lors de la classification:', error)
      return {
        category: 'other',
        confidence: 0,
        tags: []
      }
    }
  }

  async searchSimilarInvoices(query: string, limit: number = 5): Promise<Document[]> {
    try {
      const results = await this.vectorStore.similaritySearch(query, limit)
      return results
    } catch (error) {
      console.error('Erreur lors de la recherche:', error)
      return []
    }
  }
}
