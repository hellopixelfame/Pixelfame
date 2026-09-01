import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/wall.css';
import { useWallGrid } from './hooks/useWallGrid';
import { useWallData } from './hooks/useWallData';
import { useToast } from './hooks/useToast';
import { computeSquareFromDrag } from './lib/selection';
import { GRID_W, GRID_H } from './lib/pricing';
import { fetchClaimAt } from './lib/wall';
import { getSession, onAuthStateChange, sendEmailOtp, verifyEmailOtp, signInWithGooglePopup } from './lib/auth';
import { createClaim, uploadImage, payForClaim } from './lib/razorpay';

// Share links look like pixelfame.in/947-342 — read that straight off the
// URL path so opening one drops the visitor right on that square instead
// of the default wall view.
function parseDeepLinkCoord() {
  const m = window.location.pathname.match(/^\/(\d+)-(\d+)\/?$/);
  if (!m) return null;
  const x = parseInt(m[1], 10);
  const y = parseInt(m[2], 10);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return null;
  return { x, y };
}

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

  const [preview, setPreview] = useState(null); // {x,y,size} drag-selected, unconfirmed
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

  const deepLinkCoordRef = useRef(parseDeepLinkCoord());
  const deepLinkClaimRef = useRef(null);

  useEffect(() => {
    const coord = deepLinkCoordRef.current;
    if (!coord) return;
    fetchClaimAt(coord.x, coord.y)
      .then((claim) => {
        deepLinkClaimRef.current = claim;
      })
      .catch((err) => console.error('failed to load shared square', err));
  }, []);

  function findClaimAt(claims, gx, gy) {
    return claims.find((c) => gx >= c.x && gx < c.x + c.size && gy >= c.y && gy < c.y + c.size);
  }

  // Refs (not state) so the stable callbacks below always read fresh
  // claims without needing to be recreated on every fetch — populated from
  // an effect further down, never during render.
  const dataRef = useRef({ claims: [], claimedCount: 0 });

  const isCellFree = useCallback((gx, gy) => !findClaimAt(dataRef.current.claims, gx, gy), []);

  // Fires on every pointer move during a drag (and once more on release) —
  // a plain tap is just a zero-movement drag, which computeSquareFromDrag
  // naturally resolves to a 1×1 square at that cell.
  const onSelectUpdate = useCallback((anchorGx, anchorGy, gx, gy) => {
    setPreview(computeSquareFromDrag(anchorGx, anchorGy, gx, gy, dataRef.current.claims));
  }, []);

  const onClaimedTap = useCallback(
    (gx, gy) => {
      const existing = findClaimAt(dataRef.current.claims, gx, gy);
      if (existing) {
        setLightboxClaim(existing);
        setLightboxMine(myClaimIds.has(existing.id));
        setModal('lightbox');
      }
    },
    [myClaimIds]
  );

  const grid = useWallGrid({
    isCellFree,
    onSelectUpdate,
    onClaimedTap,
    onOverviewTapDenied: () => showToast("you're already looking at the whole wall"),
    isInputBlocked,
  });
  const data = useWallData(grid);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, []);

  function onConfirmPreview() {
    setSelection({ x: preview.x, y: preview.y, size: preview.size });
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

  async function afterAuthenticated(file, sel) {
    const claim = await createClaim({ x: sel.x, y: sel.y, size: sel.size });
    await uploadImage(claim.claim_id, file);
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
      await afterAuthenticated(uploadedFile, selection);
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
      await afterAuthenticated(uploadedFile, selection);
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
      await payForClaim({
        claimId: activeClaimId,
        name: displayName.trim(),
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
    setTimeout(() => {
      const claim = deepLinkClaimRef.current;
      if (claim) {
        grid.enterInteractive(claim.x, claim.y);
        setLightboxClaim(claim);
        setLightboxMine(myClaimIds.has(claim.id));
        setModal('lightbox');
        return;
      }
      if (deepLinkCoordRef.current) showToast("that square hasn't been claimed yet");
      setModal('info');
    }, 400);
  }

  return (
    <>
      <LoadingScreen hidden={appReady} onDone={handleLoadingDone} />

      <div id="screen-main" className={appReady ? 'show' : ''}>
        <Header claimedCount={data.claimedCount} onInfoClick={() => setModal('info')} />
        <WallCanvas
          grid={grid}
          claims={data.claims}
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
