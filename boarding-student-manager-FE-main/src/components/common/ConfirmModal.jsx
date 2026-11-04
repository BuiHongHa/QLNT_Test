import React from 'react';

/**
 * ConfirmModal — Custom Bootstrap-styled modal to replace window.confirm / alert.
 *
 * Props:
 *   show        {boolean}  Whether modal is visible
 *   title       {string}   Modal title
 *   message     {string}   Modal message body (can also pass JSX via children)
 *   onConfirm   {function} Called when user clicks confirm button
 *   onCancel    {function} Called when user clicks cancel / closes modal
 *   confirmText {string}   Confirm button label (default: 'Xác nhận')
 *   cancelText  {string}   Cancel button label  (default: 'Hủy')
 *   type        {string}   'confirm' | 'alert' | 'danger' — controls button styling
 *   children    {node}     Optional body content (overrides message)
 */
const ConfirmModal = ({
    show,
    title = 'Xác nhận',
    message = '',
    onConfirm,
    onCancel,
    confirmText,
    cancelText = 'Hủy',
    type = 'confirm',
    children,
}) => {
    if (!show) return null;

    const isAlert = type === 'alert' || type === 'error';
    const isDanger = type === 'danger' || type === 'error';

    const confirmLabel = confirmText || (isAlert ? 'Đã hiểu' : 'Xác nhận');
    const confirmClass = isDanger
        ? 'btn btn-danger'
        : 'btn btn-primary';

    return (
        <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1070 }}
            onClick={onCancel}
        >
            <div
                className="modal-dialog modal-dialog-centered"
                role="document"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-content" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                    <div
                        className="modal-header"
                        style={{
                            background: isDanger
                                ? 'linear-gradient(135deg, #dc3545, #c82333)'
                                : 'linear-gradient(135deg, #223771, #1565c0)',
                            color: '#fff',
                            border: 'none',
                        }}
                    >
                        <h5 className="modal-title" style={{ fontWeight: 600 }}>
                            <i
                                className={`fas ${isDanger ? 'fa-exclamation-triangle' : isAlert ? 'fa-info-circle' : 'fa-question-circle'} me-2`}
                                style={{ opacity: 0.9 }}
                            />
                            {title}
                        </h5>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={onCancel}
                        />
                    </div>
                    <div className="modal-body" style={{ padding: '20px 24px', fontSize: '0.95rem' }}>
                        {children || <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>}
                    </div>
                    <div className="modal-footer" style={{ border: 'none', padding: '12px 24px 16px' }}>
                        {!isAlert && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onCancel}
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            type="button"
                            className={confirmClass}
                            onClick={onConfirm || onCancel}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
