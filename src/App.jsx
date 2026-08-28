import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/wall.css';
import { useWallGrid } from './hooks/useWallGrid';
import { useWallData } from './hooks/useWallData';
import { useToast } from './hooks/useToast';
import { clampAnchor } from './lib/pricing';
import { getSession, onAuthStateChange, sendEmailOtp, verifyEmailOtp, signInWithGooglePopup } from './lib/auth';
import { createClaim, attachImage, setClaimName, payForClaim } from './lib/razorpay';
import { supabase, PIXEL_IMAGES_BUCKET } from './lib/supabaseClient';

import LoadingScreen from './components/LoadingScreen';
import Header from './components/Header';
import WallCanvas from './components/WallCanvas';
import Toast from './components/Toast';
import InfoModal from './components/modals/InfoModal';
import UploadModal from './components/modals/UploadModal';
import CheckoutModal from './components/modals/CheckoutModal';
import SuccessModal from './components/modals/SuccessModal';
import LightboxModal from './components/modals/LightboxModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function App() {
  const [appReady, setAppReady] = useState(false);
  const [modal, setModal] = useState(null); // 'info' | 'upload' | 'checkout' | 'success' | 'lightbox' | null
  const { toast, showToast } = useToast();

  const [session, setSession] = useState(null);
  const [myClaimIds, setMyClaimIds] = useState(() => new Set());

  const [pendingSize, setPendingSize] = useState(1);
  const [preview, setPreview] = useState(null); // {x,y} anchor, size = pendingSize
  const [selection, setSelection] = useState(null); // {x,y,size} confirmed
  const [youAreHere, setYouAreHere] = useState(null);

  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState(null);

  const [checkoutStep, setCheckoutStep] = useState(1);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [email, setEmail] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [agreedTC, setAgreedTC] = useState(false);
  const [activeClaimId, setActiveClaimId] = useState(null);

  const [lastClaim, setLastClaim] = useState(null);
  const [lightboxClaim, setLightboxClaim] = useState(null);
  const [lightboxMine, setLightboxMine] = useState(false);

  const isInputBlocked = useCallback(() => modal !== null, [modal]);

  function findClaimAt(claims, gx, gy) {
    return claims.find((c) => gx >= c.x && gx < c.x + c.size && gy >= c.y && gy < c.y + c.size);
  }

  // Refs (not state) so the stable onCellTap callback below always reads
  // fresh values without needing to be recreated on every claims/size
  // change — populated from effects further down, never during render.
  const dataRef = useRef({ claims: [], claimedCount: 0 });
  const pendingSizeRef = useRef(pendingSize);

  const onCellTap = useCallback(
    (gx, gy) => {
      const existing = findClaimAt(dataRef.current.claims, gx, gy);
      if (existing) {
        setLightboxClaim(existing);
        setLightboxMine(myClaimIds.has(existing.id));
        setModal('lightbox');
        return;
      }
      const anchor = clampAnchor(gx, gy, pendingSizeRef.current);
      setPreview(anchor);
    },
    [myClaimIds]
  );

  const grid = useWallGrid({
    onCellTap,
    onOverviewTapDenied: () => showToast("you're already looking at the whole wall"),
    isInputBlocked,
  });
  const data = useWallData(grid);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    pendingSizeRef.current = pendingSize;
  }, [pendingSize]);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, []);

  function changeSize(n) {
    setPendingSize(n);
    setPreview((p) => (p ? clampAnchor(p.x, p.y, n) : p));
  }

  function onConfirmPreview() {
    setSelection({ x: preview.x, y: preview.y, size: pendingSize });
    setPreview(null);
    setModal('upload');
  }

  function onCancelPreview() {
    setPreview(null);
  }

  function closeModal() {
    if (modal === 'upload' || modal === 'checkout') {
      setPreview(null);
      setSelection(null);
      setUploadedFile(null);
      setUploadedPreviewUrl(null);
    }
    setModal(null);
  }

  function handleUploadContinue(file, previewUrl) {
    setUploadedFile(file);
    setUploadedPreviewUrl(previewUrl);
    setCheckoutStep(1);
    setCheckoutError(null);
    setCheckoutBusy(false);
    setEmail('');
    setDisplayName('');
    setAgreedTC(false);
    setActiveClaimId(null);
    setModal('checkout');
  }

  async function afterAuthenticated(activeSession, file, sel) {
    const claim = await createClaim({ x: sel.x, y: sel.y, size: sel.size });
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${activeSession.user.id}/${claim.claim_id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(PIXEL_IMAGES_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    await attachImage(claim.claim_id, path);
    setActiveClaimId(claim.claim_id);
    setCheckoutStep(3);
  }

  async function handleSendCode(value) {
    if (!EMAIL_RE.test(value)) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      await sendEmailOtp(value);
      setOtpSentTo(value);
      setCheckoutStep(2);
    } catch (err) {
      setCheckoutError(err.message || 'could not send the code — try again');
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleVerifyCode(code) {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const sess = await verifyEmailOtp(otpSentTo, code);
      setSession(sess);
      await afterAuthenticated(sess, uploadedFile, selection);
    } catch (err) {
      setCheckoutError(err.message || "that code doesn't look right — try again");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleResendCode() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      await sendEmailOtp(otpSentTo);
      showToast('new code sent');
    } catch (err) {
      setCheckoutError(err.message || 'could not resend — try again');
    } finally {
      setCheckoutBusy(false);
    }
  }

  function handleChangeEmail() {
    setCheckoutStep(1);
    setCheckoutError(null);
  }

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setCheckoutError(null);
    try {
      const sess = await signInWithGooglePopup();
      setSession(sess);
      setOtpSentTo(sess.user.email);
      setDisplayName((prev) => prev || sess.user.user_metadata?.full_name || sess.user.user_metadata?.name || '');
      setCheckoutBusy(true);
      await afterAuthenticated(sess, uploadedFile, selection);
    } catch (err) {
      setCheckoutError(err.message || 'google sign-in failed — try again');
    } finally {
      setGoogleBusy(false);
      setCheckoutBusy(false);
    }
  }

  async function handlePay() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const trimmedName = displayName.trim();
      await setClaimName(activeClaimId, trimmedName);
      await payForClaim({
        claimId: activeClaimId,
        name: trimmedName,
        email: otpSentTo || session?.user?.email || '',
        brandColor: '#ff2e88',
      });
      completePurchase();
    } catch (err) {
      setCheckoutError(err.message || 'payment failed — try again');
    } finally {
      setCheckoutBusy(false);
    }
  }

  function completePurchase() {
    const claimRecord = {
      id: activeClaimId,
      x: selection.x,
      y: selection.y,
      size: selection.size,
      img: uploadedPreviewUrl,
      email: otpSentTo || session?.user?.email || '',
      name: displayName.trim(),
    };
    setMyClaimIds((prev) => new Set(prev).add(activeClaimId));
    setLastClaim(claimRecord);
    setYouAreHere({ x: selection.x, y: selection.y, size: selection.size });
    setTimeout(() => setYouAreHere(null), 6000);
    setSelection(null);
    setUploadedFile(null);
    setUploadedPreviewUrl(null);
    setModal('success');
  }

  function onClaimedClick(claim) {
    setLightboxClaim(claim);
    setLightboxMine(myClaimIds.has(claim.id));
    setModal('lightbox');
  }

  function handleViewOnWall() {
    setLightboxClaim(lastClaim);
    setLightboxMine(true);
    setModal('lightbox');
  }

  function handleLoadingDone() {
    setAppReady(true);
    setTimeout(() => setModal('info'), 400);
  }

  return (
    <>
      <LoadingScreen hidden={appReady} onDone={handleLoadingDone} />

      <div id="screen-main" className={appReady ? 'show' : ''}>
        <Header claimedCount={data.claimedCount} onInfoClick={() => setModal('info')} />
        <WallCanvas
          grid={grid}
          claims={data.claims}
          pendingSize={pendingSize}
          onSizeChange={changeSize}
          preview={preview}
          onConfirmPreview={onConfirmPreview}
          onCancelPreview={onCancelPreview}
          youAreHere={youAreHere}
          onClaimedClick={onClaimedClick}
          showToast={showToast}
        />
      </div>

      <Toast message={toast.message} visible={toast.visible} />

      <InfoModal open={modal === 'info'} onClose={closeModal} />
      <UploadModal open={modal === 'upload'} onClose={closeModal} selection={selection} onContinue={handleUploadContinue} />
      <CheckoutModal
        open={modal === 'checkout'}
        onClose={closeModal}
        selection={selection}
        previewImg={uploadedPreviewUrl}
        step={checkoutStep}
        busy={checkoutBusy}
        error={checkoutError}
        email={email}
        setEmail={setEmail}
        otpSentTo={otpSentTo}
        onGoogleSignIn={handleGoogleSignIn}
        googleBusy={googleBusy}
        onSendCode={handleSendCode}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
        onChangeEmail={handleChangeEmail}
        displayName={displayName}
        setDisplayName={setDisplayName}
        agreedTC={agreedTC}
        setAgreedTC={setAgreedTC}
        onPay={handlePay}
      />
      <SuccessModal
        open={modal === 'success'}
        onClose={() => setModal(null)}
        claim={lastClaim}
        onViewOnWall={handleViewOnWall}
        showToast={showToast}
      />
      <LightboxModal
        open={modal === 'lightbox'}
        onClose={() => setModal(null)}
        claim={lightboxClaim}
        mine={lightboxMine}
        showToast={showToast}
      />
    </>
  );
}

export default App;
