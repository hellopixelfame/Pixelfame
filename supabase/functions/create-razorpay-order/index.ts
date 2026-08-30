import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const keyId = Deno.env.get('RAZORPAY_KEY_ID')!;
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not signed in' }, 401);

    const { claim_id } = await req.json();
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: claim, error } = await admin.from('claims').select('*').eq('id', claim_id).single();
    if (error || !claim) return json({ error: 'claim not found' }, 404);
    if (claim.user_id !== user.id) return json({ error: 'not your claim' }, 403);
    if (claim.status !== 'pending') return json({ error: 'this claim is no longer pending' }, 409);
    if (new Date(claim.expires_at) < new Date()) {
      return json({ error: 'your reservation expired — pick a square again' }, 410);
    }
    if (!claim.image_path) return json({ error: 'upload an image first' }, 400);

    const amount = claim.size * claim.size * 100; // paise, ₹1 per pixel

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: claim_id,
        notes: { claim_id, x: claim.x, y: claim.y, size: claim.size },
      }),
    });
    const order = await res.json();
    if (!res.ok) return json({ error: order?.error?.description ?? 'could not create order' }, 502);

    await admin.from('claims').update({ razorpay_order_id: order.id }).eq('id', claim_id);

    return json({ order_id: order.id, amount: order.amount, currency: order.currency, size: claim.size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500);
  }
});
