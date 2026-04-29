import { supabase } from '../lib/supabase';
import type { EventSource, TimelineEvent } from '../types/event';
import { deleteEventImage } from './eventImageUpload';

interface DbEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  category: string;
  description: string | null;
  image_url: string | null;
  sources: EventSource[] | null;
}

function sourcesEqual(a: EventSource[], b: EventSource[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].url !== b[i].url) return false;
  }
  return true;
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
    .select('id, title, start_date, end_date, category, description, image_url, sources')
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
    const clientDescription = event.description ?? null;
    const clientImageUrl = event.imageUrl ?? null;
    const clientSources = event.sources ?? [];

    if (!existing) {
      toInsert.push(event);
    } else if (
      existing.title !== event.title ||
      existing.start_date !== event.startDate ||
      existing.end_date !== event.endDate ||
      existing.category !== event.category ||
      (existing.description ?? null) !== clientDescription ||
      (existing.image_url ?? null) !== clientImageUrl ||
      !sourcesEqual(existing.sources ?? [], clientSources)
    ) {
      toUpdate.push(event);
    }
  }

  const toDelete = serverEvents.filter(e => !clientIds.has(e.id));
  const toDeleteIds = toDelete.map(e => e.id);

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
        description: event.description ?? null,
        image_url: event.imageUrl ?? null,
        sources: event.sources ?? [],
      })
      .eq('id', event.id)
      .eq('timeline_id', timelineId);

    if (error) throw error;
  }

  // Deletes — best-effort image cleanup before removing the row so a
  // failed image delete doesn't strand the DB row.
  if (toDeleteIds.length > 0) {
    await Promise.all(
      toDelete
        .filter(e => !!e.image_url)
        .map(e => deleteEventImage(e.image_url as string))
    );

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
          description: event.description ?? null,
          image_url: event.imageUrl ?? null,
          sources: event.sources ?? [],
        }))
      );

    if (error) throw error;
  }
}
