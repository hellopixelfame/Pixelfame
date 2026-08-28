export default function Modal({ open, onClose, children }) {
  return (
    <div className={'modal-overlay' + (open ? ' open' : '')} onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-close" onClick={onClose}>
          ✕
        </div>
        {children}
      </div>
    </div>
  );
}
