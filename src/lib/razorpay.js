import { supabase } from './supabaseClient';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loadPromise = null;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('could not load Razorpay checkout'));
    document.body.appendChild(script);
  });
  return loadPromise;
}

async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const message = error.context?.error || error.message || 'something went wrong';
    throw new Error(message);
  }
  return data;
}

export async function createClaim({ x, y, size }) {
  return invokeFunction('create-claim', { x, y, size });
}

export async function attachImage(claimId, imagePath) {
  const { error } = await supabase
    .from('claims')
    .update({ image_path: imagePath })
    .eq('id', claimId);
  if (error) throw error;
}

export async function setClaimName(claimId, name) {
  const { error } = await supabase
    .from('claims')
    .update({ name: name || null })
    .eq('id', claimId);
  if (error) throw error;
}

export async function payForClaim({ claimId, name, email, brandColor }) {
  await loadCheckoutScript();
  const order = await invokeFunction('create-razorpay-order', { claim_id: claimId });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: 'PIXELFAME',
      description: `${order.size}×${order.size} pixel square`,
      prefill: { name, email },
      theme: { color: brandColor || '#ff2e88' },
      handler: async (response) => {
        try {
          const result = await invokeFunction('verify-razorpay-payment', {
            claim_id: claimId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('payment cancelled')),
      },
    });
    rzp.on('payment.failed', (resp) => {
      reject(new Error(resp.error?.description || 'payment failed'));
    });
    rzp.open();
  });
}
