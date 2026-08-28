import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const GRID_W = 2000;
const GRID_H = 1000;
const MAX_SIZE = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not signed in' }, 401);

    const { x, y, size } = await req.json();
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(size)) {
      return json({ error: 'invalid selection' }, 400);
    }
    if (size < 1 || size > MAX_SIZE) return json({ error: `size must be between 1 and ${MAX_SIZE}` }, 400);
    if (x < 0 || y < 0 || x + size > GRID_W || y + size > GRID_H) {
      return json({ error: 'selection is out of bounds' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    await admin.rpc('expire_stale_claims');

    const amount_paise = size * size * 100;
    const { data, error } = await admin
      .from('claims')
      .insert({ x, y, size, user_id: user.id, email: user.email, amount_paise })
      .select('id')
      .single();

    if (error) {
      // Postgres exclusion_violation — another claim already covers this footprint.
      if (error.code === '23P01') return json({ error: 'that square is already taken — pick another' }, 409);
      throw error;
    }

    return json({ claim_id: data.id, amount_paise, size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500);
  }
});
