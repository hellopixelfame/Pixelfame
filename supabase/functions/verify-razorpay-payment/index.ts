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

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function broadcastClaim(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>) {
  const channel = admin.channel('wall-updates');
  await channel.subscribe();
  await channel.send({
    type: 'broadcast',
    event: 'claim',
    payload: { id: claim.id, x: claim.x, y: claim.y, size: claim.size, image_path: claim.image_path, name: claim.name },
  });
  await admin.removeChannel(channel);
}

async function sendReceiptEmail(claim: Record<string, unknown>) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey || !claim.email) return;
  try {
    const link = `https://pixelfame.in/${claim.x}-${claim.y}`;
    const amount = ((claim.amount_paise as number) / 100).toLocaleString('en-IN');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'PIXELFAME <hello@pixelfame.in>',
        to: claim.email,
        subject: `you're on the wall — X:${claim.x} Y:${claim.y}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111;">
            <h2 style="margin-bottom:4px;">you're on the wall 🎉</h2>
            <p style="color:#555;">your ${claim.size}×${claim.size} pixel square is locked in. here's your receipt.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;">
              <tr><td style="padding:8px 0;color:#888;">coordinates</td><td style="padding:8px 0;text-align:right;">X:${claim.x} Y:${claim.y}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">size</td><td style="padding:8px 0;text-align:right;">${claim.size}×${claim.size}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">amount paid</td><td style="padding:8px 0;text-align:right;">₹${amount}</td></tr>
            </table>
            <p><a href="${link}" style="color:#ff2e88;">${link}</a></p>
            <p style="color:#999;font-size:12px;margin-top:24px;">keep this email as your record of purchase.</p>
          </div>
        `,
      }),
    });
  } catch {
    // best-effort — a failed receipt email shouldn't fail the payment flow
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not signed in' }, 401);

    const { claim_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: claim, error } = await admin.from('claims').select('*').eq('id', claim_id).single();
    if (error || !claim) return json({ error: 'claim not found' }, 404);
    if (claim.user_id !== user.id) return json({ error: 'not your claim' }, 403);
    if (claim.razorpay_order_id !== razorpay_order_id) return json({ error: 'order mismatch' }, 400);

    const expected = await hmacHex(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expected !== razorpay_signature) return json({ error: 'payment could not be verified' }, 400);

    if (claim.status !== 'paid') {
      await admin
        .from('claims')
        .update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id })
        .eq('id', claim_id);
      await broadcastClaim(admin, claim);
      await sendReceiptEmail(claim);
    }

    return json({ ok: true, x: claim.x, y: claim.y, size: claim.size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500);
  }
});
