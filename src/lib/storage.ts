import { supabaseAdmin } from './supabase'
import { v4 as uuidv4 } from 'uuid'

export class StorageService {
  private bucketName = 'invoices'

  async uploadFile(
    file: Buffer,
    fileName: string,
    mimeType: string,
    userId: string
  ): Promise<{ path: string; url: string }> {
    try {
      const fileId = uuidv4()
      const fileExtension = fileName.split('.').pop()
      const filePath = `${userId}/${fileId}.${fileExtension}`
      
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          contentType: mimeType,
          upsert: false
        })

      if (error) {
        throw new Error(`Erreur upload: ${error.message}`)
      }

      const { data: urlData } = supabaseAdmin.storage
        .from(this.bucketName)
        .getPublicUrl(filePath)

      return {
        path: data.path,
        url: urlData.publicUrl
      }
    } catch (error) {
      console.error('Erreur upload fichier:', error)
      throw new Error('Impossible d\'uploader le fichier')
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        throw new Error(`Erreur suppression: ${error.message}`)
      }
    } catch (error) {
      console.error('Erreur suppression fichier:', error)
      throw new Error('Impossible de supprimer le fichier')
    }
  }

  async getFileUrl(filePath: string): Promise<string> {
    try {
      const { data } = supabaseAdmin.storage
        .from(this.bucketName)
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (error) {
      console.error('Erreur récupération URL:', error)
      throw new Error('Impossible de récupérer l\'URL du fichier')
    }
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucketName)
        .download(filePath)

      if (error) {
        throw new Error(`Erreur téléchargement: ${error.message}`)
      }

      const arrayBuffer = await data.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.error('Erreur téléchargement fichier:', error)
      throw new Error('Impossible de télécharger le fichier')
    }
  }
}
