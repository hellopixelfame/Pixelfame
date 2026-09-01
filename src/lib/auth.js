import { supabase } from './supabaseClient';

export async function sendEmailOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data.session;
}

/**
 * Google sign-in via a popup rather than a full-page redirect. A redirect
 * would navigate away from the app mid-checkout and lose the in-progress
 * selection/upload state held in React; the popup completes the OAuth
 * round-trip in its own window and hands the session back to this tab.
 */
export function signInWithGooglePopup() {
  return new Promise((resolve, reject) => {
    (async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
      });
      if (error) return reject(error);

      const popup = window.open(data.url, 'pixelfame-google-auth', 'width=480,height=640');
      if (!popup) return reject(new Error('popup blocked — allow popups for this site and try again'));

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) return;
        cleanup();
        // The popup completed sign-in on its own page load and wrote the
        // session to localStorage; this callback firing here just means
        // this tab's client NOTICED that via cross-tab sync — it's not a
        // guarantee the client has already applied it internally. Calling
        // setSession explicitly forces this window's client to adopt it
        // synchronously, so the very next request (claim insert, storage
        // upload) is sent with the right Authorization header instead of
        // possibly racing ahead as an unauthenticated request and getting
        // rejected by RLS ("new row violates row-level security policy").
        supabase.auth
          .setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
          .then(({ data, error }) => {
            if (error) reject(error);
            else resolve(data.session);
          });
      });
      const poll = setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error('sign-in window was closed'));
        }
      }, 500);
      function cleanup() {
        clearInterval(poll);
        sub.subscription.unsubscribe();
        if (!popup.closed) popup.close();
      }
    })();
  });
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
