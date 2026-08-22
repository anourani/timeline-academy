// Shared Excel read/write helpers built on exceljs.
//
// This replaced the npm `xlsx` package (frozen at 0.18.5 with known
// prototype-pollution and ReDoS advisories) for parsing untrusted uploaded
// spreadsheets in the same origin that holds the user's session.

import type { CellValue } from 'exceljs'
import { formatYMD, isValidDateFormat, normalizeDate } from './dateUtils'

// exceljs is heavy; load it only when a spreadsheet is actually read or
// written so it stays out of the main bundle.
async function loadWorkbookCtor() {
  const mod = await import('exceljs')
  return (mod.default ?? mod).Workbook
}

/** Hard cap on uploaded spreadsheet size — parsing runs on the main thread. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

export const TEMPLATE_HEADERS = ['Event Title', 'Start Date', 'End Date', 'Category']

export function templateInstructions(maxTitleLength: number): string[] {
  return [
    `${maxTitleLength} char limit`,
    'Format: MM/DD/YYYY',
    'Format: MM/DD/YYYY',
    'Must match a timeline category',
  ]
}

export type SheetCellValue = string | number | Date

export type SheetRow = Record<string, SheetCellValue>

/**
 * Normalize one spreadsheet cell into the app's `YYYY-MM-DD` form, or `''`.
 *
 * exceljs hands back date cells as UTC midnight, so the parts are read in UTC.
 * The previous `new Date(value).toISOString().split('T')[0]` round-tripped
 * through local time and landed a day early east of UTC, and could not express
 * a pre-1900 date at all. Text cells go through the same `normalizeDate` the
 * CSV importer uses, so the two paths finally agree on what a date looks like.
 */
export function toDateString(value: SheetCellValue | undefined): string {
  if (value == null) return ''

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return ''
    return formatYMD(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  }

  const text = String(value).trim()
  if (text === '') return ''
  if (isValidDateFormat(text)) return text

  return normalizeDate(text) ?? ''
}

function coerceCellValue(value: CellValue): SheetCellValue {
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) {
      return coerceCellValue(value.result as CellValue)
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('')
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
  }
  return String(value)
}

/**
 * The template's second row repeats the column instructions; imports must skip
 * it wherever it appears (and tolerate files that omit it).
 */
export function isInstructionRow(row: SheetRow): boolean {
  const title = String(row['Event Title'] ?? '').toLowerCase()
  const start = String(row['Start Date'] ?? '').toLowerCase()
  return title.includes('char limit') || start.startsWith('format:')
}

/**
 * Parse the first worksheet of an uploaded workbook into objects keyed by the
 * header row (row 1). Data rows (2+) are returned in order; entirely empty
 * rows are dropped. Throws on oversized files or unreadable workbooks.
 */
export async function parseSheetRows(file: File): Promise<SheetRow[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `File is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB).`,
    )
  }

  const Workbook = await loadWorkbookCtor()
  const workbook = new Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const headers: string[] = []
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(coerceCellValue(cell.value)).trim()
  })

  const rows: SheetRow[] = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const record: SheetRow = {}
    let hasValue = false
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber]
      if (!header) return
      const value = coerceCellValue(cell.value)
      if (String(value).trim() !== '') hasValue = true
      record[header] = value
    })
    if (hasValue) rows.push(record)
  })
  return rows
}

/** Build a workbook from rows of cells and trigger a browser download. */
export async function downloadWorkbook(
  rows: (string | number)[][],
  filename: string,
): Promise<void> {
  const Workbook = await loadWorkbookCtor()
  const workbook = new Workbook()
  const worksheet = workbook.addWorksheet('Timeline Events')
  worksheet.addRows(rows)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Download the standard import template. */
export async function downloadTemplate(
  maxTitleLength: number,
  sampleCategories: [string, string],
): Promise<void> {
  await downloadWorkbook(
    [
      TEMPLATE_HEADERS,
      templateInstructions(maxTitleLength),
      ['Sample Event 1', '1/15/2024', '1/20/2024', sampleCategories[0]],
      ['Sample Event 2', '10/14/2024', '10/16/2024', sampleCategories[1]],
    ],
    'timeline-template.xlsx',
  )
}
