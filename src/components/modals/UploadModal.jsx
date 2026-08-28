import { useRef, useState } from 'react';
import Modal from './Modal';
import { priceFor, formatInr } from '../../lib/pricing';

export default function UploadModal({ open, onClose, selection, onContinue }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) {
      setError("that's not an image — try again");
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      setFile(f);
      setPreviewUrl(e.target.result);
    };
    reader.readAsDataURL(f);
  }

  if (!selection) return null;
  const size = selection.size;
  const price = formatInr(priceFor(size));

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="modal-eyebrow">upload</div>
      <h2>you picked a spot 📍</h2>
      <div className="coord-chip">
        X:{selection.x} Y:{selection.y} · {size}×{size} · {price}
      </div>

      {!previewUrl ? (
        <div
          id="dropzone"
          className={dragging ? 'drag' : ''}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="dz-icon">⬆️</div>
          <div className="dz-title">Upload Photo / File</div>
          <div className="dz-sub">Supports PNG, JPG, GIF</div>
          <div className="dz-hint">use a square-ish photo for best results — it'll get cropped to fit your {size}×{size} block</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/gif"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div id="preview-wrap" style={{ display: 'block' }}>
          <div className="lp-label mono">live preview</div>
          <div className="lightbox-img" style={{ backgroundImage: `url(${previewUrl})`, maxWidth: 200, margin: '0 auto' }} />
          <div className="lp-caption">cropped to fit — square photos scale in cleanest</div>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="legal-note">
        🚫 don't upload anything unlawful — nudity or sexual content, hate speech, violence, someone else's copyrighted
        work, or anything else illegal to publish in India. images that violate this are deleted with no refund. see
        our{' '}
        <a href="/PIXELFAME_Terms_and_Conditions.pdf" target="_blank" rel="noopener noreferrer">
          terms &amp; conditions
        </a>
        .
      </div>

      <div className="warn-line" style={{ visibility: previewUrl ? 'visible' : 'hidden' }}>
        ⚠ this can't be replaced later — last chance to swap it
      </div>

      <button className="btn btn-primary" disabled={!file} onClick={() => onContinue(file, previewUrl)}>
        continue →
      </button>
      {previewUrl && (
        <button className="btn btn-secondary" onClick={reset}>
          choose a different image
        </button>
      )}
    </Modal>
  );
}
