import { supabase } from '../lib/supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

export async function uploadEventImage(
  file: File,
  userId: string,
  eventId: string
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG and PNG images are supported.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Image must be 5MB or smaller.');
  }
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${eventId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, file, { contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage
    .from('event-images')
    .getPublicUrl(path);
  return data.publicUrl;
}

// Removing an image is best-effort: if the URL doesn't match the storage path
// pattern (e.g. the user hand-edited it) we silently skip; if the storage
// call fails we log but don't surface the error, since the row deletion
// still succeeded.
export async function deleteEventImage(publicUrl: string): Promise<void> {
  const match = publicUrl.match(/event-images\/(.+)$/);
  if (!match) return;
  const path = match[1];
  const { error } = await supabase.storage.from('event-images').remove([path]);
  if (error) {
    console.error('Failed to delete event image:', error);
  }
}
