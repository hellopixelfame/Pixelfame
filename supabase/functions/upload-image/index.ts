import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PIXEL_IMAGES_BUCKET = 'pixel-images';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Uploads the claim's photo and attaches it server-side, using the service
// role — the browser's own session/RLS path for this (client-side storage
// upload + claims update) turned out unreliable in practice, so this
// mirrors the same trusted pattern already used by create-claim.
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

    const form = await req.formData();
    const claimId = form.get('claim_id');
    const file = form.get('file');
    if (typeof claimId !== 'string' || !(file instanceof File)) {
      return json({ error: 'missing claim_id or file' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: claim, error: claimErr } = await admin
      .from('claims')
      .select('id, user_id, status')
      .eq('id', claimId)
      .single();
    if (claimErr || !claim) return json({ error: 'claim not found' }, 404);
    if (claim.user_id !== user.id) return json({ error: 'not your claim' }, 403);
    if (claim.status !== 'pending') return json({ error: 'this claim is no longer pending' }, 409);

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${user.id}/${claimId}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(PIXEL_IMAGES_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;

    const { error: updErr } = await admin.from('claims').update({ image_path: path }).eq('id', claimId);
    if (updErr) throw updErr;

    return json({ ok: true, image_path: path });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500);
  }
});
