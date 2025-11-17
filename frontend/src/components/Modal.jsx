import React from 'react';
import './Modal.css';

export default function Modal({ isOpen, onClose, title, children, type = 'info', onConfirm = null }) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header modal-header-${type}`}>
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        <div className="modal-footer">
          {onConfirm ? (
            <>
              <button className="modal-button secondary" onClick={onClose}>Cancel</button>
              <button className="modal-button" onClick={handleConfirm}>Confirm</button>
            </>
          ) : (
            <button className="modal-button" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

