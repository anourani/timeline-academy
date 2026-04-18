import { useRef } from 'react'
import { read, utils, writeFile } from 'xlsx'
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

interface ExcelRow {
  'Event Title'?: string
  'Start Date'?: string | Date
  'End Date'?: string | Date
  Category?: string
}

interface ImportCSVModalProps {
  isOpen: boolean
  onClose: () => void
  onImportEvents: (events: TimelineEvent[]) => void
}

export function ImportCSVModal({ isOpen, onClose, onImportEvents }: ImportCSVModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = () => {
    const wb = utils.book_new()
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category']
    const instructions = [
      '55 char limit',
      'Format: MM/DD/YYYY',
      'Format: MM/DD/YYYY',
      'Must match a timeline category',
    ]
    const data = [
      headers,
      instructions,
      ['Sample Event 1', '1/15/2024', '1/20/2024', DEFAULT_CATEGORIES[0].label],
      ['Sample Event 2', '10/14/2024', '10/16/2024', DEFAULT_CATEGORIES[1].label],
    ]
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, 'Timeline Events')
    writeFile(wb, 'timeline-template.xlsx')
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      if (!(file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        alert('Please select an Excel file (.xlsx or .xls)')
        return
      }

      const data = await file.arrayBuffer()
      const workbook = read(data, { cellDates: true })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = utils.sheet_to_json<ExcelRow>(worksheet)

      const events: TimelineEvent[] = rows
        .slice(2)
        .map((row) => {
          let startDate = ''
          let endDate = ''
          if (row['Start Date']) {
            const startDateObj = new Date(row['Start Date'] as string)
            startDate = startDateObj.toISOString().split('T')[0]
          }
          if (row['End Date']) {
            const endDateObj = new Date(row['End Date'] as string)
            endDate = endDateObj.toISOString().split('T')[0]
          } else {
            endDate = startDate
          }
          const categoryLabel = row['Category']
          const matched = DEFAULT_CATEGORIES.find(
            (c) => c.label.toLowerCase() === categoryLabel?.toLowerCase()
          )
          const category: TimelineCategory = matched?.id || DEFAULT_CATEGORIES[0].id
          return {
            id: crypto.randomUUID(),
            title: row['Event Title'] || '',
            startDate,
            endDate,
            category,
          }
        })
        .filter((event) => event.title && event.startDate)

      if (events.length === 0) {
        alert('No valid events found in the file')
        return
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
