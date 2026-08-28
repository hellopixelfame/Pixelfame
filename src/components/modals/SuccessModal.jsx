import Modal from './Modal';

export default function SuccessModal({ open, onClose, claim, onViewOnWall, onCopyLink, showToast }) {
  if (!claim) return null;
  const link = `pixelfame.live/${claim.x}-${claim.y}`;

  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => showToast('link copied!'));
    } else {
      showToast('link copied!');
    }
    onCopyLink?.();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-eyebrow">it's official</div>
      <h2>you're on the wall 🎉</h2>
      <div
        id="success-canvas-preview"
        style={{ backgroundImage: `url(${claim.img})` }}
        onClick={onViewOnWall}
      >
        <div className="sc-tag mono">
          X:{claim.x} Y:{claim.y} · {claim.size}×{claim.size}
        </div>
      </div>
      <div className="email-note mono">
        📧 sent your coordinates + receipt to <span>{claim.email}</span>
      </div>
      <p>screenshot it, send it, make your friends jealous their square wasn't taken.</p>
      <div className="share-link-row">
        <input type="text" readOnly value={link} />
        <button className="share-copy" onClick={copy}>
          copy
        </button>
      </div>
      <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onClose}>
        back to the wall
      </button>
    </Modal>
  );
}
