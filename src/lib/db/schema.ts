import schema from './schema.json'

export type TableSchema = {
  columns: string[]
  notes?: string
}

export const TABLE_SCHEMAS = schema as Record<string, TableSchema>

export function getTableSchemaString(tableName: string): string | null {
  const s = TABLE_SCHEMAS[tableName.toLowerCase()]
  if (!s) return null
  const lines = [
    `Table: ${tableName}`,
    'Colonnes:',
    ...s.columns.map((c) => `  - ${c}`)
  ]
  if (s.notes) {
    lines.push(`Notes: ${s.notes}`)
  }
  return lines.join('\n')
}




