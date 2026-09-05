const PLATFORMS = [
  { id: "whatsapp", label: "WhatsApp", glyph: "💬", bg: "#25D366" },
  { id: "x", label: "X", glyph: "X", bg: "#000000", color: "#fff", text: true },
  { id: "facebook", label: "Facebook", glyph: "f", bg: "#1877F2", color: "#fff", text: true },
  { id: "reddit", label: "Reddit", glyph: "👽", bg: "#FF4500" },
  { id: "instagram", label: "Instagram", glyph: "📷", bg: "linear-gradient(45deg, #f9ce34, #ee2a7b 60%, #6228d7)" },
  { id: "snapchat", label: "Snapchat", glyph: "👻", bg: "#FFFC00" },
];

function shareUrlFor(id, text, link) {
  const encText = encodeURIComponent(text);
  const encLink = encodeURIComponent(link);
  if (id === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;
  if (id === "x") return `https://twitter.com/intent/tweet?text=${encText}&url=${encLink}`;
  if (id === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${encLink}&quote=${encText}`;
  if (id === "reddit") return `https://www.reddit.com/submit?url=${encLink}&title=${encText}`;
  return null;
}

// Instagram and Snapchat have no web intent that accepts prefilled text —
// copy the caption+link and drop the user straight into the app to paste it.
function shareByCopy(platform, text, link, showToast) {
  const payload = `${text} ${link}`;
  if (navigator.clipboard) navigator.clipboard.writeText(payload);
  showToast?.(`caption copied — paste it in ${platform.label}!`);
  window.open(
    platform.id === "instagram" ? "https://www.instagram.com/" : "https://www.snapchat.com/",
    "_blank",
    "noopener,noreferrer"
  );
}

export default function ShareSocialRow({ text, link, showToast }) {
  function handleClick(platform) {
    const url = shareUrlFor(platform.id, text, link);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    shareByCopy(platform, text, link, showToast);
  }

  return (
    <div className="share-social-row">
      {PLATFORMS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`share-social-btn${p.text ? " is-text" : ""}`}
          style={{ background: p.bg, color: p.color }}
          title={`share to ${p.label}`}
          onClick={() => handleClick(p)}
        >
          {p.glyph}
        </button>
      ))}
    </div>
  );
}
