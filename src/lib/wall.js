import { supabase, imagePublicUrl } from './supabaseClient';

export async function fetchClaimsInBox(vx1, vy1, vx2, vy2) {
  const { data, error } = await supabase
    .from('wall_claims')
    .select('id, x, y, size, image_path')
    .lte('x', vx2)
    .gte('x2', vx1)
    .lte('y', vy2)
    .gte('y2', vy1)
    .limit(2000);
  if (error) throw error;
  return data.map((row) => ({ ...row, img: imagePublicUrl(row.image_path) }));
}

export async function fetchClaimedCount() {
  const { data, error } = await supabase
    .from('wall_stats')
    .select('claimed_pixels')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data?.claimed_pixels ?? 0;
}

export function subscribeToWallUpdates(onClaim) {
  const channel = supabase
    .channel('wall-updates')
    .on('broadcast', { event: 'claim' }, ({ payload }) => {
      onClaim({ ...payload, img: imagePublicUrl(payload.image_path) });
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToStats(onCount) {
  const channel = supabase
    .channel('wall-stats-updates')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'wall_stats', filter: 'id=eq.1' },
      (payload) => onCount(payload.new.claimed_pixels)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
