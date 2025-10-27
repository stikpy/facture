export interface ExtractedInvoiceData {
  // Informations générales
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  total_amount?: number
  tax_amount?: number
  subtotal?: number
  document_type?: 'invoice' | 'delivery_note' | 'credit_note' | 'quote' | 'other'
  document_reference?: string
  delivery_note_number?: string
  related_delivery_note_numbers?: string[]
  related_invoice_numbers?: string[]

  // Informations fournisseur
  supplier_name?: string
  supplier_address?: string
  supplier_email?: string
  supplier_phone?: string
  supplier_vat_number?: string
  
  // Informations client
  client_name?: string
  client_address?: string
  client_email?: string
  client_phone?: string
  client_vat_number?: string
  
  // Articles/services
  items?: InvoiceItem[]
  
  // Métadonnées
  currency?: string
  payment_terms?: string
  notes?: string
  
  // Classification
  category?: string
  confidence_score?: number
}

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total_price: number
  tax_rate?: number
}

export interface InvoiceClassification {
  category: 'expense' | 'income' | 'tax' | 'other'
  subcategory?: string
  confidence: number
  tags: string[]
}

export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  message?: string
  error?: string
}
