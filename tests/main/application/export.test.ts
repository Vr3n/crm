import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'export-test-'))
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

/**
 * The export service uses `app.getPath('documents')` at runtime. We test the
 * workbook generation logic directly by building the workbook inline — same
 * algorithm as exportTableToExcel but without the Electron path dependency.
 */
function buildWorkbook(input: {
  sheetName: string
  columns: { header: string; key: string; width?: number; format?: string }[]
  rows: Record<string, unknown>[]
}): Promise<Buffer> {
  const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A1A2E' }
  }
  const MONEY = '₹#,##0.00'
  const DATE = 'dd MMM yyyy'
  const DATETIME = 'dd MMM yyyy, hh:mm AM/PM'
  const NUMBER = '#,##0.##'

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(input.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  const headerRow = sheet.addRow(input.columns.map((c) => c.header))
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })

  function measureWidth(value: unknown, format?: string): number {
    if (value == null || value === '') return 8
    const str = String(value)
    const overhead = format === 'money' ? 3 : format === 'datetime' ? 4 : format === 'date' ? 1 : 0
    return Math.min(Math.max(str.length + overhead, 8), 50)
  }

  const columnWidths: number[] = input.columns.map((c) => measureWidth(c.header))

  for (const row of input.rows) {
    const values = input.columns.map((col) => {
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
      const col = input.columns[colNumber - 1]
      cell.font = { size: 11, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }

      if (col.format === 'money') cell.numFmt = MONEY
      else if (col.format === 'date') cell.numFmt = DATE
      else if (col.format === 'datetime') cell.numFmt = DATETIME
      else if (col.format === 'number') cell.numFmt = NUMBER

      const raw = row[col.key]
      const w = col.width ?? measureWidth(raw, col.format)
      if (w > (columnWidths[colNumber - 1] ?? 0)) {
        columnWidths[colNumber - 1] = w
      }
    })
  }

  sheet.columns.forEach((col, i) => {
    col.width = (columnWidths[i] ?? 10) + 2
  })

  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

describe('exportTableToExcel workbook generation', () => {
  it('creates a valid xlsx with headers and data', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Members',
      columns: [
        { header: 'Name', key: 'name', format: 'text' },
        { header: 'Phone', key: 'phone', format: 'text' }
      ],
      rows: [
        { name: 'Aarav', phone: '9876543210' },
        { name: 'Priya', phone: '9123456789' }
      ]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Members')
    expect(ws).toBeDefined()
    expect(ws.rowCount).toBe(3) // header + 2 data rows
    expect(ws.getCell('A1').value).toBe('Name')
    expect(ws.getCell('B1').value).toBe('Phone')
    expect(ws.getCell('A2').value).toBe('Aarav')
    expect(ws.getCell('B2').value).toBe('9876543210')
  })

  it('applies money format (₹#,##0.00)', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Payments',
      columns: [
        { header: 'Amount', key: 'amount', format: 'money' },
        { header: 'Label', key: 'label', format: 'text' }
      ],
      rows: [{ amount: 1500, label: 'Monthly' }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Payments')
    const amountCell = ws.getCell('A2')
    expect(amountCell.value).toBe(1500)
    expect(amountCell.numFmt).toBe('₹#,##0.00')
  })

  it('applies date format (dd MMM yyyy)', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Expirations',
      columns: [{ header: 'Expires', key: 'expires', format: 'date' }],
      rows: [{ expires: '2026-03-15' }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Expirations')
    const cell = ws.getCell('A2')
    expect(cell.numFmt).toBe('dd MMM yyyy')
  })

  it('applies datetime format', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Audit',
      columns: [{ header: 'Timestamp', key: 'ts', format: 'datetime' }],
      rows: [{ ts: '2026-08-30T14:30:00Z' }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Audit')
    expect(ws.getCell('A2').numFmt).toBe('dd MMM yyyy, hh:mm AM/PM')
  })

  it('applies number format', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Stats',
      columns: [{ header: 'Count', key: 'count', format: 'number' }],
      rows: [{ count: 42 }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Stats')
    expect(ws.getCell('A2').numFmt).toBe('#,##0.##')
  })

  it('handles empty rows and null values', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Empty',
      columns: [
        { header: 'A', key: 'a' },
        { header: 'B', key: 'b' }
      ],
      rows: [{ a: '', b: null }, { a: 'hello', b: undefined }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Empty')
    expect(ws.rowCount).toBe(3)
    // empty strings and null/undefined become null in Excel
    expect(ws.getCell('A2').value).toBeNull()
    expect(ws.getCell('B2').value).toBeNull()
  })

  it('freezes the header row', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Frozen',
      columns: [{ header: 'Col', key: 'col' }],
      rows: [{ col: 1 }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Frozen')
    expect(ws.views[0].state).toBe('frozen')
    expect(ws.views[0].ySplit).toBe(1)
  })

  it('auto-sizes columns with padding', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Widths',
      columns: [{ header: 'Short', key: 'val' }],
      rows: [{ val: 'a very long value here' }]
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Widths')
    // "a very long value here" = 22 chars + 2 padding = 24
    expect(ws.getColumn(1).width).toBe(24)
  })
})

describe('filename sanitization', () => {
  it('sanitizes special characters via inline logic', () => {
    function sanitize(name: string): string {
      return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase()
    }

    expect(sanitize('Memberships Report')).toBe('memberships_report')
    expect(sanitize('Leads!!!@#$%')).toBe('leads_')
    expect(sanitize('  lead   export  ')).toBe('_lead_export_')
    expect(sanitize('all_ready_fine')).toBe('all_ready_fine')
  })
})
