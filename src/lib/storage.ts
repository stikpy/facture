import { supabaseAdmin } from './supabase'
import { v4 as uuidv4 } from 'uuid'

export class StorageService {
  private bucketName = 'invoices'

  private async ensureBucketExists(): Promise<void> {
    try {
      // Vérifier si le bucket existe déjà
      const { data: existingBucket, error: getBucketError } = await (supabaseAdmin as any).storage.getBucket?.(this.bucketName)

      if (!existingBucket || getBucketError) {
        // Certaines versions n'ont pas getBucket: on tente la création directement
        const { error: createError } = await supabaseAdmin.storage.createBucket(this.bucketName, {
          public: false,
        })
        if (createError && !/already exists/i.test(createError.message)) {
          throw createError
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification/création du bucket:', error)
      // On ne bloque pas ici car l'erreur détaillée remontera à l'upload si le bucket n'existe pas
    }
  }

  async uploadFile(
    file: Buffer,
    fileName: string,
    mimeType: string,
    organizationId: string
  ): Promise<{ path: string; url: string }> {
    try {
      // S'assurer que le bucket existe
      await this.ensureBucketExists()

      const fileId = uuidv4()
      const fileExtension = fileName.split('.').pop()
      const filePath = `${organizationId}/${fileId}.${fileExtension}`
      
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          contentType: mimeType,
          upsert: false
        })

      if (error) {
        throw new Error(`Erreur upload: ${error.message}`)
      }

      return {
        path: data.path,
        url: ''
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
