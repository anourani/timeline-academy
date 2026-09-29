import { useRef } from 'react'
import { FileUp, Download, type LucideIcon } from 'lucide-react'
import { PopupShell } from '@/components/ui/PopupShell'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import type { TimelineEvent, TimelineCategory } from '@/types/event'
import {
  downloadTemplate,
  isInstructionRow,
  parseSheetRows,
  toDateString,
} from '@/utils/excelSheet'

const MAX_TITLE_LENGTH = 55

interface ImportCSVModalProps {
  isOpen: boolean
  onClose: () => void
  onImportEvents: (events: TimelineEvent[]) => void
}

interface ImportOptionProps {
  icon: LucideIcon
  label: string
  meta: string
  onClick: () => void
}

/**
 * One choice, drawn as a tile in the same dark well the delete dialog uses for
 * its timeline preview: a label over a mono caption saying what it takes or
 * gives.
 */
function ImportOption({ icon: Icon, label, meta, onClick }: ImportOptionProps) {
  const isMobile = useIsMobile()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-[10px] border border-[#262626] bg-[#0A0A0A] px-3.5 text-left',
        'transition-colors hover:border-[#404040] hover:bg-[#111111]',
        'outline-none focus-visible:ring-1 focus-visible:ring-white/40',
        isMobile ? 'min-h-[64px] rounded-[12px] py-3.5' : 'py-3',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('text-[#DADEE5]', isMobile ? 'text-[16px]' : 'body-m')}>{label}</span>
        <span className="font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]">
          {meta}
        </span>
      </span>
      <Icon
        size={18}
        strokeWidth={1.5}
        className="shrink-0 text-[#6D7073] transition-colors group-hover:text-[#C9CED4]"
        aria-hidden
      />
    </button>
  )
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
    <PopupShell
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      title="Import data"
      description="Add events from an Excel file, or download the template to start one."
      topSlot={
        <span className="font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]">
          Spreadsheet import
        </span>
      }
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
      />

      <div className="flex flex-col gap-2">
        <ImportOption
          icon={FileUp}
          label="Choose a file"
          meta=".xlsx or .xls"
          onClick={() => fileInputRef.current?.click()}
        />
        <ImportOption
          icon={Download}
          label="Download template"
          meta="Title · Start · End · Category"
          onClick={handleDownloadTemplate}
        />
      </div>

      <p className="m-0 text-[12px] leading-[18px] text-[#6D7073]">
        Event Title and Start Date are required. Titles can be up to {MAX_TITLE_LENGTH} characters.
      </p>
    </PopupShell>
  )
}
