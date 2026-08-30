import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { logger } from '../lib/logger'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type CellFormat = 'text' | 'money' | 'date' | 'datetime' | 'number'

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

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A1A2E' }
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
  name: 'Calibri'
}

const DATA_FONT: Partial<ExcelJS.Font> = {
  size: 11,
  name: 'Calibri'
}

const MONEY_FORMAT = '₹#,##0.00'
const DATE_FORMAT = 'dd MMM yyyy'
const DATETIME_FORMAT = 'dd MMM yyyy, hh:mm AM/PM'
const NUMBER_FORMAT = '#,##0.##'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function measureWidth(value: unknown, format?: CellFormat): number {
  if (value == null || value === '') return 8
  const str = String(value)
  // Add extra width for formatted columns (₹ symbol, date separators, etc.)
  const overhead = format === 'money' ? 3 : format === 'datetime' ? 4 : format === 'date' ? 1 : 0
  return Math.min(Math.max(str.length + overhead, 8), 50)
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
  return undefined
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase()
}

/* -------------------------------------------------------------------------- */
/* Export Service                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Generates a styled .xlsx workbook from table data and saves it to
 * Documents/CrownCRM/Exports/. Returns the absolute file path.
 *
 * The renderer is responsible for passing the correct data (filtered/sorted
 * rows from the displayed table). This service focuses purely on Excel
 * generation — no database access, no domain logic.
 */
export async function exportTableToExcel(input: ExportTableInput): Promise<string> {
  const { sheetName, filename, columns, rows } = input

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CrownCRM'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  // ── Header row ─────────────────────────────────────────────────────────
  const headerRow = sheet.addRow(columns.map((c) => c.header))
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF333355' } }
    }
  })

  // ── Data rows ──────────────────────────────────────────────────────────
  const columnWidths: number[] = columns.map((c) => measureWidth(c.header))

  for (const row of rows) {
    const values = columns.map((col) => {
      const raw = row[col.key]
      if (raw == null || raw === '') return null
      if (col.format === 'money' || col.format === 'number') {
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
        return isNaN(num) ? null : num
      }
      return raw
    })

    const dataRow = sheet.addRow(values)

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1]
      cell.font = DATA_FONT
      cell.alignment = { vertical: 'middle', horizontal: 'left' }

      if (col.format === 'money') {
        cell.numFmt = MONEY_FORMAT
      } else if (col.format === 'date') {
        cell.numFmt = DATE_FORMAT
      } else if (col.format === 'datetime') {
        cell.numFmt = DATETIME_FORMAT
      } else if (col.format === 'number') {
        cell.numFmt = NUMBER_FORMAT
      }

      // Track max column width
      const raw = row[col.key]
      const w = col.width ?? measureWidth(raw, col.format)
      if (w > (columnWidths[colNumber - 1] ?? 0)) {
        columnWidths[colNumber - 1] = w
      }
    })
  }

  // ── Auto-size columns ──────────────────────────────────────────────────
  sheet.columns.forEach((col, i) => {
    col.width = (columnWidths[i] ?? 10) + 2 // padding
  })

  // ── Write to file ──────────────────────────────────────────────────────
  const safeFilename = sanitizeFilename(filename)
  const finalFilename = safeFilename.endsWith('.xlsx') ? safeFilename : `${safeFilename}.xlsx`

  const documentsPath = app.getPath('documents')
  const outputDir = join(documentsPath, 'CrownCRM', 'Exports')
  await ensureDir(outputDir)

  const outputPath = join(outputDir, finalFilename)
  await workbook.xlsx.writeFile(outputPath)

  logger.info(`Excel exported: ${outputPath} (${rows.length} rows)`)

  return outputPath
}
