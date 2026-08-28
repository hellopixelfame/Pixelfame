import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!envUrl || !envAnonKey) {
  console.warn(
    'Supabase env vars are missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example). ' +
      'Falling back to a placeholder client so the UI still loads; anything that talks to Supabase will fail until this is set.'
  );
}

// createClient() validates its URL synchronously and throws if it's missing
// or malformed — a syntactically-valid placeholder here means a missing
// .env degrades to failed network calls (logged, non-fatal) instead of a
// blank white screen.
export const supabase = createClient(envUrl || 'https://placeholder.supabase.co', envAnonKey || 'placeholder-anon-key');

export const PIXEL_IMAGES_BUCKET = 'pixel-images';

export function imagePublicUrl(path) {
  if (!path) return '';
  return supabase.storage.from(PIXEL_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
