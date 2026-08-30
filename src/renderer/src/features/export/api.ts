type CellFormat = 'text' | 'money' | 'date' | 'datetime' | 'number'

export interface ExportColumn {
  header: string
  key: string
  width?: number
  format?: CellFormat
}

export interface ExportTableInput {
  sheetName: string
  filename: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

/**
 * Sends table data to the main process for Excel generation.
 * Returns the absolute path of the saved .xlsx file.
 */
export async function exportExcel(input: ExportTableInput): Promise<string> {
  return window.api.export.excel(input)
}
