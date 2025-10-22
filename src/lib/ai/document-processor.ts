import { ChatOpenAI } from '@langchain/openai'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ExtractedInvoiceData, InvoiceClassification } from '@/types/invoice'

export class DocumentProcessor {
  private llm: ChatOpenAI
  private embeddings: OpenAIEmbeddings
  private vectorStore: MemoryVectorStore

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
    
    this.vectorStore = new MemoryVectorStore(this.embeddings)
  }

  async processDocument(text: string, fileName: string): Promise<ExtractedInvoiceData> {
    try {
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

      // Diviser le document en chunks
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      })
      
      const docs = await splitter.createDocuments([text])
      
      // Ajouter les documents au vector store
      await this.vectorStore.addDocuments(docs)
      
      // Créer la chaîne de récupération
      const retriever = this.vectorStore.asRetriever()
      
      // Template pour l'extraction de données
      const prompt = ChatPromptTemplate.fromTemplate(`
        Vous êtes un expert en extraction de données de factures. 
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
        
        3. VÉRIFICATIONS:
           - Si supplier_name = client_name → ERREUR! Relisez attentivement le document
           - Le nom du fichier peut contenir un indice sur le fournisseur
           - Cherchez les RIB/IBAN → ils appartiennent au FOURNISSEUR (qui reçoit le paiement)
        
        Contexte: {context}
        
        Extrayez les informations suivantes au format JSON:
        {{
          "invoice_number": "numéro de facture",
          "invoice_date": "date de facture (YYYY-MM-DD)",
          "due_date": "date d'échéance (YYYY-MM-DD)",
          "total_amount": montant_total_numerique,
          "tax_amount": montant_tva_numerique,
          "subtotal": sous_total_numerique,
          "supplier_name": "nom EXACT et COMPLET du fournisseur (ZONE ÉMETTEUR en haut du document)",
          "supplier_address": "adresse complète du fournisseur",
          "supplier_email": "email du fournisseur",
          "supplier_phone": "téléphone du fournisseur",
          "supplier_vat_number": "numéro TVA/SIRET du fournisseur",
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
              "tax_rate": taux_tva_numerique
            }}
          ],
          "currency": "devise (EUR, USD, etc.)",
          "payment_terms": "conditions de paiement",
          "notes": "notes additionnelles"
        }}
        
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
      
      const result = await retrievalChain.invoke({
        input: `Extrayez toutes les données de cette facture: ${fileName}`,
      })
      
      // Parser le JSON retourné (tolérant aux fences et au texte annexe)
      const extractedData = sanitizeToJson(result) as ExtractedInvoiceData
      
      return extractedData
      
    } catch (error) {
      console.error('Erreur lors du traitement du document:', error)
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
