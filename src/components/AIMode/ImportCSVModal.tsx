import { useRef } from 'react'
import { FileUp, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import type { TimelineEvent, TimelineCategory } from '@/types/event'
import {
  downloadTemplate,
  isInstructionRow,
  parseSheetRows,
  type SheetCellValue,
} from '@/utils/excelSheet'

const MAX_TITLE_LENGTH = 55

function toDateString(value: SheetCellValue | undefined): string {
  if (value == null || String(value).trim() === '') return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

interface ImportCSVModalProps {
  isOpen: boolean
  onClose: () => void
  onImportEvents: (events: TimelineEvent[]) => void
}

export function ImportCSVModal({ isOpen, onClose, onImportEvents }: ImportCSVModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = () => {
    void downloadTemplate(MAX_TITLE_LENGTH, [
      DEFAULT_CATEGORIES[0].label,
      DEFAULT_CATEGORIES[1].label,
    ])
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      if (!(file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        alert('Please select an Excel file (.xlsx or .xls)')
        return
      }

      const allRows = await parseSheetRows(file)
      const rows = allRows.filter((row) => !isInstructionRow(row))

      const events: TimelineEvent[] = []
      const errors: string[] = []

      rows.forEach((row, index) => {
        const rowLabel = `Row ${index + 1}`
        const title = String(row['Event Title'] ?? '').trim()
        const startDate = toDateString(row['Start Date'])

        if (!title || !startDate) {
          errors.push(`${rowLabel}: missing ${!title ? 'Event Title' : 'valid Start Date'}`)
          return
        }
        if (title.length > MAX_TITLE_LENGTH) {
          errors.push(`${rowLabel}: title exceeds ${MAX_TITLE_LENGTH} characters`)
          return
        }

        const endDate = toDateString(row['End Date']) || startDate
        const categoryLabel = String(row['Category'] ?? '')
        const matched = DEFAULT_CATEGORIES.find(
          (c) => c.label.toLowerCase() === categoryLabel.toLowerCase()
        )
        const category: TimelineCategory = matched?.id || DEFAULT_CATEGORIES[0].id
        events.push({
          id: crypto.randomUUID(),
          title,
          startDate,
          endDate,
          category,
        })
      })

      if (events.length === 0) {
        alert(errors.length > 0 ? errors.join('\n') : 'No valid events found in the file')
        return
      }
      if (errors.length > 0) {
        alert(`Some rows were skipped:\n${errors.join('\n')}`)
      }

      onImportEvents(events)
    } catch (err) {
      console.error('Error importing file:', err)
      alert('Error importing file. Please check the format and try again.')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Import events from an Excel file or download a template to get started.
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
        />

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full justify-between px-4 py-3 h-auto"
          >
            <span>Import Data</span>
            <FileUp size={20} className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="w-full justify-between px-4 py-3 h-auto"
          >
            <span>Download Import Template</span>
            <Download size={20} className="text-muted-foreground" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
