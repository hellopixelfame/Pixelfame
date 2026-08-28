# Supabase setup

## One-time project setup

```
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                       # applies migrations/0001_init.sql
supabase functions deploy create-claim create-razorpay-order verify-razorpay-payment razorpay-webhook
```

Enable the **Google** provider under Authentication → Providers, and add
`http://localhost:5173` (and your production origin) to Authentication →
URL Configuration → Redirect URLs.

## Edge function secrets (never committed, never in `.env`)

```
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically for every edge function — no need to set them.

## Razorpay webhook

In the Razorpay dashboard, add a webhook pointing at:

```
https://<project-ref>.functions.supabase.co/razorpay-webhook
```

subscribed to the `payment.captured` event, using the same secret as
`RAZORPAY_WEBHOOK_SECRET` above.
