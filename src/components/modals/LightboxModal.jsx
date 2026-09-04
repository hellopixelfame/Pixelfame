import Modal from "./Modal";
import ShareSocialRow from "../ShareSocialRow";

export default function LightboxModal({
  open,
  onClose,
  claim,
  mine,
  showToast
}) {
  if (!claim) return null;
  const link = `https://pixelfame.in/${claim.x}-${claim.y}`;
  const shareText = `I just claimed my ${claim.size}×${claim.size} spot on the PIXELFAME wall 🎉`;

  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => showToast("link copied!"));
    } else {
      showToast("link copied!");
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-eyebrow">
        {mine ? "your square" : "on the wall"}
      </div>
      <h2>
        {mine
          ? "this one's yours 🎉"
          : claim.name
            ? `${claim.name}'s square`
            : "someone’s square"}
      </h2>
      <div className="coord-chip">
        X:{claim.x} Y:{claim.y} · {claim.size}×{claim.size}
      </div>
      <div
        className="lightbox-img"
        style={{ backgroundImage: `url(${claim.img})` }}
      />
      {mine && (
        <div>
          <div className="field-label" style={{ textAlign: "center" }}>
            it's yours — share it
          </div>
          <div className="share-link-row">
            <input type="text" readOnly value={link} />
            <button className="share-copy" onClick={copy}>
              copy
            </button>
          </div>
          <ShareSocialRow text={shareText} link={link} showToast={showToast} />
        </div>
      )}
    </Modal>
  );
}
