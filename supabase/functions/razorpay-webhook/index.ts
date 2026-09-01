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
        from: 'Pixelfame <hello@pixelfame.in>',
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
    // best-effort — a failed receipt email shouldn't fail webhook processing
  }
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
    await sendReceiptEmail(claim);

    return new Response('ok', { status: 200 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'error', { status: 500 });
  }
});
