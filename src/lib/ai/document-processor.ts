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
        
        Contexte: {context}
        
        Extrayez les informations suivantes au format JSON:
        {{
          "invoice_number": "numéro de facture",
          "invoice_date": "date de facture (YYYY-MM-DD)",
          "due_date": "date d'échéance (YYYY-MM-DD)",
          "total_amount": montant_total_numerique,
          "tax_amount": montant_tva_numerique,
          "subtotal": sous_total_numerique,
          "supplier_name": "nom du fournisseur",
          "supplier_address": "adresse du fournisseur",
          "supplier_email": "email du fournisseur",
          "supplier_phone": "téléphone du fournisseur",
          "supplier_vat_number": "numéro TVA du fournisseur",
          "client_name": "nom du client",
          "client_address": "adresse du client",
          "client_email": "email du client",
          "client_phone": "téléphone du client",
          "client_vat_number": "numéro TVA du client",
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
      
      // Parser le JSON retourné
      const extractedData = JSON.parse(result.answer) as ExtractedInvoiceData
      
      return extractedData
      
    } catch (error) {
      console.error('Erreur lors du traitement du document:', error)
      throw new Error('Impossible de traiter le document')
    }
  }

  async classifyInvoice(data: ExtractedInvoiceData): Promise<InvoiceClassification> {
    try {
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
      
      return JSON.parse(result.content as string) as InvoiceClassification
      
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
