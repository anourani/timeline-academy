import { Skeleton } from '../ui/skeleton'
import type { EventWhen } from '@/utils/eventWhen'

export interface GlanceRow {
  label: string
  value: string
  /** Quieter text after the value, e.g. the duration after the date. */
  note?: string | null
}

interface AtAGlanceProps {
  when: EventWhen | null
  /** Rows the model supplies (Where, Who, Age), in display order. */
  rows: GlanceRow[]
  /** The description is still streaming and may yet bring rows. */
  pending: boolean
}

/**
 * The event view's "At a glance" list: the plain facts a reader wants before
 * the story (docs/2026-11-24-event-view-prd.md §6). When always shows — it is
 * computed from the event's own dates. The rest come from the model and are
 * simply absent for descriptions written before they existed.
 */
export function AtAGlance({ when, rows, pending }: AtAGlanceProps) {
  const all: GlanceRow[] = []
  if (when) all.push({ label: 'When', value: when.date, note: when.duration })
  all.push(...rows)
  if (all.length === 0 && !pending) return null

  return (
    // No visible heading: the rows speak for themselves under the title. The
    // section keeps its name for screen readers.
    <section aria-label="At a glance">
      <dl className="m-0 border-b border-[#262626]">
        {all.map((row) => (
          <div key={row.label} className="flex gap-[16px] py-[12px] border-t border-[#262626]">
            <dt className="shrink-0 w-[72px] font-['Avenir',sans-serif] text-[13px] leading-[22px] text-[#9B9EA3]">
              {row.label}
            </dt>
            <dd className="m-0 min-w-0 font-['Avenir',sans-serif] text-[15px] leading-[22px] text-[#ECEEF1]">
              {row.value}
              {row.note && <span className="text-[#9B9EA3]"> · {row.note}</span>}
            </dd>
          </div>
        ))}
        {pending && rows.length === 0 && (
          <div aria-hidden="true" className="flex gap-[16px] py-[14px] border-t border-[#262626]">
            <Skeleton className="h-[14px] w-[48px]" />
            <Skeleton className="h-[14px] w-[60%]" />
          </div>
        )}
      </dl>
    </section>
  )
}
