import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../../config/api';
import ConfirmModal from '../common/ConfirmModal';

const TrashManager = ({ type }) => {
    const activeTab = type || 'students';
    const [data, setData] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });

    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));

    const fetchData = useCallback(() => {
        setLoading(true);
        fetch(apiUrl(`/api/trash/${activeTab}`))
            .then(res => res.json())
            .then(resData => {
                if (resData.success) {
                    setData(resData.data || []);
                } else {
                    showAlert('Lỗi', resData.message || 'Không thể tải dữ liệu');
                }
                setLoading(false);
            })
            .catch(() => {
                showAlert('Lỗi', 'Lỗi kết nối server');
                setLoading(false);
            });
    }, [activeTab]);

    useEffect(() => {
        setSelectedIds([]);
        fetchData();
    }, [fetchData]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(data.map(item => item.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkRestore = () => {
        if (selectedIds.length === 0) return;
        showConfirm(
            'Khôi phục hàng loạt',
            `Bạn có chắc chắn muốn khôi phục ${selectedIds.length} mục đã chọn?`,
            () => {
                closeConfirm();
                fetch(apiUrl(`/api/trash/${activeTab}/bulk-restore`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                    .then(res => res.json())
                    .then(resData => {
                        if (resData.success) {
                            showAlert('Thành công', resData.message || 'Đã khôi phục thành công');
                            setSelectedIds([]);
                            fetchData();
                        } else {
                            showAlert('Lỗi', resData.message || 'Không thể khôi phục');
                        }
                    })
                    .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
            }
        );
    };

    const handleBulkHardDelete = () => {
        if (selectedIds.length === 0) return;
        showConfirm(
            'Cảnh báo Xoá vĩnh viễn hàng loạt!',
            `Bạn có chắc chắn muốn XOÁ VĨNH VIỄN ${selectedIds.length} mục đã chọn? HÀNH ĐỘNG NÀY SẼ XOÁ SẠCH DỮ LIỆU KHỎI MYSQL VÀ KHÔNG THỂ HOÀN TÁC!`,
            () => {
                closeConfirm();
                fetch(apiUrl(`/api/trash/${activeTab}/bulk-hard`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                    .then(res => res.json())
                    .then(resData => {
                        if (resData.success) {
                            showAlert('Thành công', resData.message || 'Đã xoá vĩnh viễn khỏi MySQL');
                            setSelectedIds([]);
                            fetchData();
                        } else {
                            showAlert('Lỗi', resData.message || resData.error || 'Không thể xoá vĩnh viễn');
                        }
                    })
                    .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
            },
            'danger'
        );
    };

    const handleRestore = (id) => {
        fetch(apiUrl(`/api/trash/${activeTab}/${id}/restore`), {
            method: 'PUT'
        })
            .then(res => res.json())
            .then(resData => {
                if (resData.success) {
                    showAlert('Thành công', 'Đã khôi phục dữ liệu');
                    fetchData();
                } else {
                    showAlert('Lỗi', resData.message || 'Không thể khôi phục');
                }
            })
            .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
    };

    const handleHardDelete = (item) => {
        showConfirm(
            'Cảnh báo Xoá vĩnh viễn!',
            `Bạn có chắc chắn muốn xoá vĩnh viễn ${item.name || item.id}? HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC VÀ SẼ XOÁ SẠCH DỮ LIỆU LIÊN QUAN!`,
            () => {
                closeConfirm();
                fetch(apiUrl(`/api/trash/${activeTab}/${item.id}/hard`), {
                    method: 'DELETE'
                })
                    .then(res => res.json())
                    .then(resData => {
                        if (resData.success) {
                            showAlert('Thành công', 'Đã xoá vĩnh viễn');
                            fetchData();
                        } else {
                            showAlert('Lỗi', resData.message || resData.error || 'Không thể xoá vĩnh viễn');
                        }
                    })
                    .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
            },
            'danger'
        );
    };

    return (
        <div style={{ padding: '20px' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>
                    <i className="fas fa-trash-restore me-2"></i> 
                    {activeTab === 'students' ? 'Học sinh đã xoá' : activeTab === 'teachers' ? 'Giáo viên đã xoá' : 'Phòng ở đã xoá'}
                </h2>
            </div>

            {selectedIds.length > 0 && (
                <div className="alert alert-info d-flex justify-content-between align-items-center mb-3">
                    <span>Đã chọn <strong>{selectedIds.length}</strong> mục</span>
                    <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
                        <button className="btn btn-sm btn-success" onClick={handleBulkRestore}>
                            <i className="fas fa-undo me-1"></i> Khôi phục đã chọn ({selectedIds.length})
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={handleBulkHardDelete}>
                            <i className="fas fa-times-circle me-1"></i> Xoá vĩnh viễn khỏi MySQL ({selectedIds.length})
                        </button>
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                {loading ? (
                    <div className="text-center py-4">Đang tải...</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover table-striped">
                            <thead className="table-dark" style={{ background: '#00206d' }}>
                                <tr>
                                    <th style={{ width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            onChange={handleSelectAll}
                                            checked={selectedIds.length === data.length && data.length > 0}
                                        />
                                    </th>
                                    <th>Mã / ID</th>
                                    <th>Tên</th>
                                    {activeTab === 'rooms' ? <th>Số giường</th> : <th>Thông tin khác</th>}
                                    <th className="text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => handleSelectRow(item.id)}
                                            />
                                        </td>
                                        <td className="fw-bold">{item.id}</td>
                                        <td>{item.name}</td>
                                        {activeTab === 'rooms' ? (
                                            <td>{item.num_of_bed || '-'}</td>
                                        ) : (
                                            <td>{item.dob ? `NS: ${item.dob}` : ''} {item.sex ? `| GT: ${item.sex}` : ''}</td>
                                        )}
                                        <td className="text-center">
                                            <button className="btn btn-sm btn-success me-2" onClick={() => handleRestore(item.id)} title="Khôi phục">
                                                <i className="fas fa-undo"></i> Khôi phục
                                            </button>
                                            <button className="btn btn-sm btn-danger" onClick={() => handleHardDelete(item)} title="Xoá vĩnh viễn">
                                                <i className="fas fa-times-circle"></i> Xoá vĩnh viễn
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {data.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center py-4 text-muted">
                                            Thùng rác trống
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ConfirmModal
                show={confirmModal.show}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirm}
                type={confirmModal.type}
            />
            <ConfirmModal
                show={alertModal.show}
                title={alertModal.title}
                message={alertModal.message}
                onCancel={closeAlert}
                type="alert"
            />
        </div>
    );
};

export default TrashManager;
