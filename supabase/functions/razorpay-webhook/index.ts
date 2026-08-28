// Durability backstop: Razorpay calls this directly (no Supabase session),
// so it must be deployed with verify_jwt = false (see supabase/config.toml).
// It marks a claim paid even if the client never called
// verify-razorpay-payment (e.g. the browser closed mid-checkout).
import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!;
    const signature = req.headers.get('x-razorpay-signature') ?? '';
    const rawBody = await req.text();

    const expected = await hmacHex(webhookSecret, rawBody);
    if (expected !== signature) return new Response('invalid signature', { status: 400 });

    const event = JSON.parse(rawBody);
    if (event.event !== 'payment.captured') return new Response('ignored', { status: 200 });

    const payment = event.payload.payment.entity;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: claim } = await admin.from('claims').select('*').eq('razorpay_order_id', payment.order_id).maybeSingle();
    if (!claim || claim.status === 'paid') return new Response('ok', { status: 200 });

    await admin
      .from('claims')
      .update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: payment.id })
      .eq('id', claim.id);
    await broadcastClaim(admin, claim);

    return new Response('ok', { status: 200 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'error', { status: 500 });
  }
});
