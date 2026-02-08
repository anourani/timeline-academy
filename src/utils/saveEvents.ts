import { supabase } from '../lib/supabase';
import type { TimelineEvent } from '../types/event';

interface DbEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  category: string;
}

/**
 * Diff-based save for timeline events. Compares client events against
 * server state and issues only the necessary INSERT/UPDATE/DELETE operations.
 */
export async function saveTimelineEvents(
  timelineId: string,
  clientEvents: TimelineEvent[]
): Promise<void> {
  // 1. Fetch current server events for this timeline
  const { data: serverRows, error: fetchError } = await supabase
    .from('events')
    .select('id, title, start_date, end_date, category')
    .eq('timeline_id', timelineId);

  if (fetchError) throw fetchError;

  const serverEvents: DbEvent[] = serverRows ?? [];
  const serverMap = new Map(serverEvents.map(e => [e.id, e]));
  const clientIds = new Set(clientEvents.map(e => e.id));

  // 2. Classify events
  const toInsert: TimelineEvent[] = [];
  const toUpdate: TimelineEvent[] = [];

  for (const event of clientEvents) {
    const existing = serverMap.get(event.id);
    if (!existing) {
      toInsert.push(event);
    } else if (
      existing.title !== event.title ||
      existing.start_date !== event.startDate ||
      existing.end_date !== event.endDate ||
      existing.category !== event.category
    ) {
      toUpdate.push(event);
    }
  }

  const toDeleteIds = serverEvents
    .filter(e => !clientIds.has(e.id))
    .map(e => e.id);

  // 3. Execute operations: UPDATE first, then DELETE, then INSERT

  // Updates — Supabase doesn't support batch update by different IDs,
  // so we issue individual upserts for changed rows.
  for (const event of toUpdate) {
    const { error } = await supabase
      .from('events')
      .update({
        title: event.title,
        start_date: event.startDate,
        end_date: event.endDate,
        category: event.category,
      })
      .eq('id', event.id)
      .eq('timeline_id', timelineId);

    if (error) throw error;
  }

  // Deletes
  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from('events')
      .delete()
      .in('id', toDeleteIds)
      .eq('timeline_id', timelineId);

    if (error) throw error;
  }

  // Inserts — pass client-generated IDs to keep them stable
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('events')
      .insert(
        toInsert.map(event => ({
          id: event.id,
          timeline_id: timelineId,
          title: event.title,
          start_date: event.startDate,
          end_date: event.endDate,
          category: event.category,
        }))
      );

    if (error) throw error;
  }
}
