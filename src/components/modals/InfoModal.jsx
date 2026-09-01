import Modal from './Modal';

export default function InfoModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-eyebrow">welcome</div>
      <h2>this is the wall. 🧱</h2>
      <p>
        20 lakh empty squares. one shared canvas. every square holds a photo — forever, or until the internet ends.
        tap for one pixel, or drag for a bigger square block. it's your call.
      </p>
      <ul className="rules">
        <li>
          <span className="emoji">📍</span>
          <div>
            <div className="t">pick your spot</div>
            <div className="d">zoom in, then tap a square — or tap and drag for more space</div>
          </div>
        </li>
        <li>
          <span className="emoji">🎲</span>
          <div>
            <div className="t">go as big as you want</div>
            <div className="d">drag for more space — up to 10×10 (100 pixels) in one go</div>
          </div>
        </li>
        <li>
          <span className="emoji">🖼️</span>
          <div>
            <div className="t">drop your pic</div>
            <div className="d">one shot only — you can't swap it later, so choose wisely</div>
          </div>
        </li>
        <li>
          <span className="emoji">💸</span>
          <div>
            <div className="t">pay from ₹1 to lock it in</div>
            <div className="d">price scales with size — 1 pixel = ₹1, 4 pixels = ₹4, and so on</div>
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
