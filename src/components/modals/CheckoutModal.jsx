import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { priceFor, formatInr } from '../../lib/pricing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function OtpStep({ amount, otpSentTo, busy, error, onVerifyCode, onResendCode, onChangeEmail }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [localError, setLocalError] = useState('');
  const boxRefs = useRef([]);
  // Mounted fresh each time step becomes 2 (see the {step === 2 && ...}
  // branch below), so this only needs to run once on mount — no reset
  // effect required when the step changes.
  useEffect(() => {
    boxRefs.current[0]?.focus();
  }, []);

  const displayError = localError || error;

  function updateDigit(i, value) {
    const v = value.replace(/[^0-9]/g, '').slice(0, 1);
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    setLocalError('');
    if (v && i < 5) boxRefs.current[i + 1]?.focus();
  }

  function onDigitKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) boxRefs.current[i - 1]?.focus();
  }

  function onDigitPaste(i, e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
    const next = [...otp];
    for (let j = 0; j < text.length && i + j < 6; j++) next[i + j] = text[j];
    setOtp(next);
    boxRefs.current[Math.min(i + text.length, 5)]?.focus();
  }

  function submitCode() {
    const code = otp.join('');
    if (code.length < 6) {
      setLocalError('enter all 6 digits');
      return;
    }
    onVerifyCode(code);
  }

  return (
    <div className="step-panel active">
      <div className="modal-eyebrow">verify</div>
      <h2>check your inbox</h2>
      <div className="field-label" style={{ marginBottom: 12 }}>
        we sent a 6-digit code to <b style={{ color: 'var(--text)' }}>{otpSentTo}</b>
      </div>
      <div className="price-note">💸&nbsp; verify to claim this square for {amount}</div>
      <div className="otp-row">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => (boxRefs.current[i] = el)}
            className={'otp-box' + (displayError ? ' error' : '')}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => updateDigit(i, e.target.value)}
            onKeyDown={(e) => onDigitKeyDown(i, e)}
            onPaste={(e) => onDigitPaste(i, e)}
          />
        ))}
      </div>
      <div className="otp-error mono" style={{ visibility: displayError ? 'visible' : 'hidden' }}>
        {displayError || "that code doesn't look right — try again"}
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={submitCode}>
        {busy ? 'verifying…' : 'verify & continue →'}
      </button>
      <div className="otp-links">
        <button type="button" className="otp-link" disabled={busy} onClick={onResendCode}>
          resend code
        </button>
        <span className="otp-dot">·</span>
        <button type="button" className="otp-link" disabled={busy} onClick={onChangeEmail}>
          change email
        </button>
      </div>
    </div>
  );
}

export default function CheckoutModal({
  open,
  onClose,
  selection,
  previewImg,
  step,
  busy,
  error,
  email,
  setEmail,
  otpSentTo,
  onGoogleSignIn,
  googleBusy,
  onSendCode,
  onVerifyCode,
  onResendCode,
  onChangeEmail,
  displayName,
  setDisplayName,
  agreedTC,
  setAgreedTC,
  onPay,
}) {
  if (!selection) return null;
  const size = selection.size;
  const amount = formatInr(priceFor(size));

  return (
    <Modal open={open} onClose={onClose}>
      <div className="steps">
        <div className={'step-dot' + (step >= 1 ? ' active' : '')} />
        <div className={'step-dot' + (step >= 2 ? ' active' : '')} />
        <div className={'step-dot' + (step >= 3 ? ' active' : '')} />
      </div>

      {step === 1 && (
        <div className="step-panel active">
          <div className="modal-eyebrow">verify</div>
          <h2>before you buy this pixel for {amount}</h2>

          <button className="btn-google" disabled={googleBusy} onClick={onGoogleSignIn}>
            <span className="g-badge">G</span> {googleBusy ? 'connecting to Google…' : 'continue with Google'}
          </button>

          <div className="or-divider">
            <span>or verify with email instead</span>
          </div>

          <label className="field-label">your email</label>
          <input
            className="field"
            type="email"
            placeholder="you@internet.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <div className="form-error">{error}</div>}
          <button
            className="btn btn-primary"
            disabled={busy || !EMAIL_RE.test(email.trim())}
            onClick={() => onSendCode(email.trim())}
          >
            {busy ? 'sending code…' : 'send verification code →'}
          </button>

          <div className="why-box">
            <div className="why-title">why we need this</div>
            <div className="why-line">•&nbsp; to verify your payment</div>
            <div className="why-line">•&nbsp; to send you the exact coordinates of your photo on the grid</div>
          </div>
        </div>
      )}

      {step === 2 && (
        <OtpStep
          amount={amount}
          otpSentTo={otpSentTo}
          busy={busy}
          error={error}
          onVerifyCode={onVerifyCode}
          onResendCode={onResendCode}
          onChangeEmail={onChangeEmail}
        />
      )}

      {step === 3 && (
        <div className="step-panel active">
          <div className="modal-eyebrow">payment</div>
          <h2>lock in your square</h2>
          <div className="order-row">
            <img src={previewImg} alt="" />
            <div className="order-meta">
              <div className="m1">
                {size}×{size} pixel square
              </div>
              <div className="m2 mono">
                X:{selection.x} Y:{selection.y}
              </div>
            </div>
            <div className="order-price mono">{amount}</div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <label className="field-label">your name (optional, shown on the wall)</label>
          <input
            className="field"
            type="text"
            maxLength={60}
            placeholder="e.g. Alex"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className="tc-checkbox">
            <input type="checkbox" checked={agreedTC} onChange={(e) => setAgreedTC(e.target.checked)} />
            <span>
              I've read and agree to the{' '}
              <a href="/PIXELFAME_Terms_and_Conditions.pdf" target="_blank" rel="noopener noreferrer">
                Terms &amp; Conditions
              </a>{' '}
              — all payments are final, no refunds.
            </span>
          </label>
          <button className="btn btn-primary" disabled={!agreedTC || busy} onClick={onPay}>
            {busy ? 'claiming your spot on the grid…' : `pay ${amount} & lock it in`}
          </button>
          <div className="pay-lock mono">🔒 secured checkout · powered by razorpay</div>
        </div>
      )}
    </Modal>
  );
}
