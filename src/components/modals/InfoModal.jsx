import Modal from './Modal';

export default function InfoModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-eyebrow">welcome</div>
      <h2>this is the wall. 🧱</h2>
      <p>
        20 lakh squares. one shared canvas. every square can hold exactly one photo of one person (or cat, or meme —
        we don't judge) — forever, or until the internet ends.
      </p>
      <ul className="rules">
        <li>
          <span className="emoji">📍</span>
          <div>
            <div className="t">pick your square</div>
            <div className="d">hover, zoom in, find your spot on the grid</div>
          </div>
        </li>
        <li>
          <span className="emoji">🖼️</span>
          <div>
            <div className="t">go bigger if you want</div>
            <div className="d">₹1 per pixel — grab a 2×2, 3×3, or bigger square block for a bigger photo</div>
          </div>
        </li>
        <li>
          <span className="emoji">📸</span>
          <div>
            <div className="t">drop your pic, pay to lock it in</div>
            <div className="d">one shot only — you can't swap it later, so choose wisely</div>
          </div>
        </li>
        <li>
          <span className="emoji">📣</span>
          <div>
            <div className="t">flex it</div>
            <div className="d">share your square before someone claims the one next to it</div>
          </div>
        </li>
      </ul>
      <button className="btn btn-primary" onClick={onClose}>
        let's go →
      </button>
      <div className="hint-line">missed something? reopen this anytime from the ⓘ up top.</div>
    </Modal>
  );
}
