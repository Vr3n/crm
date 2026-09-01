import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { logger } from '../lib/logger'
import { exponentFor, type CurrencyCode } from '../../shared/contracts/money'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type CellFormat = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'isodate'

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
  currency: CurrencyCode
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

const CURRENCY_FORMATS: Record<CurrencyCode, string> = {
  INR: '₹#,##0.00', USD: '$#,##0.00', EUR: '€#,##0.00', GBP: '£#,##0.00',
  JPY: '¥#,##0', KRW: '₩#,##0', VND: '₫#,##0', CLP: '$#,##0',
  ISK: 'kr#,##0', KWD: 'د.ك#,##0.000', BHD: 'د.ب#,##0.000',
  OMR: 'ر.ع#,##0.000', JOD: 'د.ا#,##0.000', TND: 'د.ت#,##0.000',
  AED: 'د.إ#,##0.00', SGD: 'S$#,##0.00'
}

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
  const overhead =
    format === 'money' ? 3
    : format === 'datetime' ? 4
    : format === 'date' || format === 'isodate' ? 1
    : 0
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
  const { sheetName, filename, columns, rows, currency } = input

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
      if (col.format === 'money') {
        const minor = typeof raw === 'number' ? raw : parseFloat(String(raw))
        if (Number.isNaN(minor)) return null
        return minor / 10 ** exponentFor(currency)
      }
      if (col.format === 'number') {
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
        return isNaN(num) ? null : num
      }
      if (col.format === 'isodate' || col.format === 'datetime') {
        const d = new Date(String(raw))
        return Number.isNaN(d.getTime()) ? null : d
      }
      return raw
    })

    const dataRow = sheet.addRow(values)

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1]
      cell.font = DATA_FONT
      cell.alignment = { vertical: 'middle', horizontal: 'left' }

      if (col.format === 'money') {
        cell.numFmt = CURRENCY_FORMATS[currency]
      } else if (col.format === 'date' || col.format === 'isodate') {
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
  shell.showItemInFolder(outputPath)

  logger.info(`Excel exported: ${outputPath} (${rows.length} rows)`)

  return outputPath
}
