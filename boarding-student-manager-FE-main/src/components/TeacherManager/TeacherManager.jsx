import { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import ConfirmModal from '../common/ConfirmModal';
import { formatDate } from '../../utils/dateFormatter';

const API = apiUrl('/api/teacher');
const API_LOGIN = apiUrl('/api/login');
const roleMap = { 1: 'teacher', 2: 'manager', 3: 'manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };
const emptyForm = {
    id_VNeID: '',
    name: '',
    birth: '',
    sex: '',
    phone_number: '',
    email: '',
    address: '',
    homeroom_class_id: '',
    role_id: '',
};

const toDateInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
};

const TeacherManager = () => {
    const user = getStoredUser() || {};
    let userRole = user.role_name || roleMap[user.role_id] || '';
    if (user.username === 'admin' || userRole === 'admin' || userRole === 'administrator') {
        userRole = 'manager';
    }
    const [teachers, setTeachers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [uploadDuplicates, setUploadDuplicates] = useState([]);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [accountModal, setAccountModal] = useState({ show: false, teachers: [], checked: new Set(), loading: false, result: null });

    const filteredTeachers = useMemo(() => {
        if (!searchTerm.trim()) return teachers;
        const term = searchTerm.trim().toLowerCase();
        return teachers.filter(t => 
            (t.name || '').toLowerCase().includes(term) ||
            (t.id_VNeID || '').toLowerCase().includes(term)
        );
    }, [teachers, searchTerm]);

    const duplicateGroups = useMemo(() => {
        const groups = {};
        uploadDuplicates.forEach(item => {
            const cls = item.homeroom_class || 'Không chủ nhiệm';
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(item);
        });
        return groups;
    }, [uploadDuplicates]);

    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));
    const [promptModal, setPromptModal] = useState({ show: false, title: '', message: '', onConfirm: null });

    const fetchTeachers = () => {
        setLoading(true);
        fetch(`${API}/`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setTeachers(data.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchTeachers();
        fetch(`${API_LOGIN}/roles`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setRoles(data.data);
            })
            .catch(console.error);
    }, []);

    const openCreateModal = () => {
        setModalMode('create');
        setForm(emptyForm);
        setError('');
        setShowModal(true);
    };

    const openDetailModal = (teacher) => {
        setModalMode('edit');
        setForm({
            id_VNeID: teacher.id_VNeID || '',
            name: teacher.name || '',
            birth: toDateInput(teacher.birth),
            sex: teacher.sex === 0 || teacher.sex === 1 ? String(teacher.sex) : '',
            phone_number: teacher.phone_number || '',
            email: teacher.email || '',
            address: teacher.address || '',
            homeroom_class_id: teacher.homeroom_classes || '',
            role_id: teacher.role_id || '',
        });
        setError('');
        setShowModal(true);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        fetch(`${API}/upload`, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fetchTeachers();
                    if (data.duplicates && data.duplicates.length > 0) {
                        setUploadDuplicates(data.duplicates);
                        setShowDuplicateModal(true);
                    } else {
                        showAlert('Thành công', data.message);
                    }
                } else {
                    showAlert('Lỗi', 'Lỗi: ' + (data.message || data.error));
                }
            })
            .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
    };

    const updateAccountRole = (username, roleId) => {
        if (userRole !== 'manager' || !roleId) return Promise.resolve({ success: true });
        return fetch(`${API_LOGIN}/accounts/${username}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: Number(roleId), actor_role: userRole }),
        }).then(res => res.json());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.id_VNeID.trim() || !form.name.trim()) {
            setError('Số CCCD và họ tên là bắt buộc.');
            return;
        }
        if (!/^\d{12}$/.test(form.id_VNeID.trim())) {
            setError('Số CCCD phải gồm đúng 12 chữ số.');
            return;
        }

        const payload = {
            id_VNeID: form.id_VNeID.trim(),
            name: form.name.trim(),
            birth: form.birth || null,
            sex: form.sex !== '' ? Number(form.sex) : null,
            phone_number: form.phone_number.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
            homeroom_class_id: form.homeroom_class_id.trim() || null,
            is_home_teacher: form.homeroom_class_id.trim() ? 1 : 0,
        };

        setSubmitting(true);
        try {
            const teacherResponse = await fetch(modalMode === 'create' ? `${API}/` : `${API}/${form.id_VNeID}`, {
                method: modalMode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const teacherData = await teacherResponse.json();
            if (!teacherData.success) {
                setError(teacherData.error || teacherData.message || 'Có lỗi xảy ra.');
                setSubmitting(false);
                return;
            }

            const roleData = await updateAccountRole(form.id_VNeID.trim(), form.role_id);
            if (!roleData.success) {
                setError(roleData.error || roleData.message || 'Không thể cập nhật vai trò.');
                setSubmitting(false);
                return;
            }

            setShowModal(false);
            setForm(emptyForm);
            fetchTeachers();
        } catch (err) {
            setError('Lỗi kết nối server.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResetPassword = (teacher) => {
        setPromptModal({
            show: true,
            title: 'Cấp lại mật khẩu',
            message: `Nhập mật khẩu mới cho giáo viên ${teacher.name} (${teacher.id_VNeID}):`,
            onConfirm: (newPassword) => {
                setPromptModal({ show: false, title: '', message: '', onConfirm: null });
                if (!newPassword) return;

                fetch(`${API_LOGIN}/reset-password/${teacher.id_VNeID}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ actor_role: 'manager', new_password: newPassword })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) showAlert('Thành công', 'Cấp lại mật khẩu thành công!');
                    else showAlert('Lỗi', data.message || data.error || 'Có lỗi xảy ra');
                })
                .catch(() => showAlert('Lỗi', 'Lỗi kết nối'));
            }
        });
    };

    const handleDelete = (id_vneid) => {
        showConfirm('Vô hiệu hoá', 'Bạn có chắc chắn muốn vô hiệu hoá giáo viên này?', () => {
            closeConfirm();
            fetch(`${API}/${id_vneid}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setShowModal(false);
                        fetchTeachers();
                    } else showAlert('Lỗi', data.message || data.error || 'Lỗi khi vô hiệu hoá');
                })
                .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
        }, 'danger');
    };

    const handleCreateAccounts = () => {
        setAccountModal({ show: true, teachers: [], checked: new Set(), loading: true, result: null });
        fetch(`${API}/without-accounts`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const teachers = data.data || [];
                    setAccountModal(prev => ({
                        ...prev, loading: false,
                        teachers,
                        checked: new Set(teachers.map(t => t.id_VNeID)),
                    }));
                } else {
                    setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: data.error || 'Lỗi tải danh sách giáo viên' } }));
                }
            })
            .catch(() => setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: 'Lỗi kết nối server' } })));
    };

    const submitCreateAccounts = () => {
        const idVneids = [...accountModal.checked];
        setAccountModal(prev => ({ ...prev, loading: true, result: null }));
        fetch(`${API}/create-accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor_role: userRole, id_vneids: idVneids }),
        })
            .then(res => res.json())
            .then(data => {
                setAccountModal(prev => ({ ...prev, loading: false, result: { success: data.success, text: data.message || data.error } }));
                if (data.success) fetchTeachers();
            })
            .catch(() => setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: 'Lỗi kết nối server' } })));
    };

    const toggleAccountTeacher = (id_vneid) => {
        setAccountModal(prev => {
            const next = new Set(prev.checked);
            if (next.has(id_vneid)) next.delete(id_vneid); else next.add(id_vneid);
            return { ...prev, checked: next };
        });
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ color: '#00206d', marginBottom: '20px', fontWeight: 700 }}>Quản lý giáo viên</h2>

            <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" style={{ background: '#00206d', borderColor: '#00206d' }} onClick={openCreateModal}>
                            <i className="fas fa-plus me-1"></i> Thêm giáo viên mới
                        </button>
                        <a href={`${API}/template`} className="btn btn-outline-secondary">
                            <i className="fas fa-download me-1"></i> Mẫu Excel
                        </a>
                        <a href={`${API}/export`} className="btn btn-outline-success">
                            <i className="fas fa-file-excel me-1"></i> Xuất Excel
                        </a>
                        {userRole === 'manager' && (
                            <button className="btn btn-outline-info" onClick={handleCreateAccounts} title="Cấp tài khoản cho giáo viên chưa có">
                                <i className="fas fa-user-shield me-1"></i>Cấp tài khoản
                            </button>
                        )}
                        <label className="btn btn-success mb-0" style={{ cursor: 'pointer' }}>
                            <i className="fas fa-upload me-1"></i> Nhập từ Excel
                            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                        </label>
                    </div>
                    <div className="position-relative" style={{ width: '100%', maxWidth: '300px' }}>
                        <i className="fas fa-search position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}></i>
                        <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Tìm kiếm họ tên hoặc số CCCD..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            style={{ paddingLeft: '35px' }}
                        />
                    </div>
                </div>

                {loading ? (
                    <div>Đang tải danh sách giáo viên...</div>
                ) : (
                    <table className="table table-striped table-hover">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th>Số CCCD</th>
                                <th>Họ và tên</th>
                                <th>Ngày sinh</th>
                                <th>Giới tính</th>
                                <th>Số điện thoại</th>
                                <th>Email</th>
                                <th>Lớp CN</th>
                                <th>Vai trò</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTeachers.map(teacher => (
                                <tr key={teacher.id_VNeID} onClick={() => openDetailModal(teacher)} style={{ cursor: 'pointer' }}>
                                    <td>{teacher.id_VNeID}</td>
                                    <td>{teacher.name}</td>
                                    <td>{formatDate(teacher.birth)}</td>
                                    <td>{teacher.sex === 1 ? 'Nữ' : teacher.sex === 0 ? 'Nam' : '-'}</td>
                                    <td>{teacher.phone_number || '-'}</td>
                                    <td>{teacher.email || '-'}</td>
                                    <td>{teacher.homeroom_classes || '-'}</td>
                                    <td>{roles.find(role => role.id === teacher.role_id)?.label || teacher.role_name || '-'}</td>
                                    <td>
                                         <div className="d-flex gap-1">
                                             <button className="btn btn-sm btn-info" type="button" title="Chi tiết/Sửa" onClick={(e) => { e.stopPropagation(); openDetailModal(teacher); }}>
                                                 <i className="fas fa-edit"></i>
                                             </button>
                                         </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredTeachers.length === 0 && (
                                <tr><td colSpan="9" className="text-center">Không có dữ liệu</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{modalMode === 'create' ? 'Thêm giáo viên mới' : 'Thông tin giáo viên'}</h5>
                                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    {error && <div className="alert alert-danger">{error}</div>}
                                    <div className="row">
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Số CCCD *</label>
                                            <input className="form-control" maxLength={12} value={form.id_VNeID} onChange={(e) => setForm({ ...form, id_VNeID: e.target.value })} disabled={modalMode === 'edit'} required />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Họ và tên *</label>
                                            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="row">
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Ngày sinh</label>
                                            <input type="date" lang="en-GB" className="form-control" value={form.birth} onChange={(e) => setForm({ ...form, birth: e.target.value })} />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Giới tính</label>
                                            <select className="form-control" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                                                <option value="">-- Chọn --</option>
                                                <option value="0">Nam</option>
                                                <option value="1">Nữ</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="row">
                                        <div className="col-md-4 mb-3">
                                            <label className="form-label">Số điện thoại</label>
                                            <input className="form-control" maxLength={10} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
                                        </div>
                                        <div className="col-md-4 mb-3">
                                            <label className="form-label">Email</label>
                                            <input className="form-control" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                                        </div>
                                        <div className="col-md-4 mb-3">
                                            <label className="form-label">Vai trò</label>
                                            <select className="form-control" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} disabled={userRole !== 'manager'}>
                                                <option value="">-- Chọn --</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.id}>{role.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Địa chỉ</label>
                                        <input className="form-control" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Lớp chủ nhiệm</label>
                                        <input className="form-control" placeholder="VD: 10A1 hoặc 10A1_2025-2026" value={form.homeroom_class_id} onChange={(e) => setForm({ ...form, homeroom_class_id: e.target.value })} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <div className="me-auto d-flex gap-2">
                                        {modalMode === 'edit' && userRole === 'manager' && form.role_id && (
                                            <button type="button" className="btn btn-outline-warning" onClick={() => handleResetPassword(form)}>
                                                Cấp lại mật khẩu
                                            </button>
                                        )}
                                        {modalMode === 'edit' && (
                                            <button type="button" className="btn btn-outline-danger" onClick={() => handleDelete(form.id_VNeID)}>
                                                Vô hiệu hoá
                                            </button>
                                        )}
                                    </div>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Lưu'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {showDuplicateModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '15px' }}>
                            <div className="modal-header border-0 pb-0">
                                <h5 className="modal-title fw-bold text-warning">
                                    <i className="fas fa-exclamation-triangle me-2"></i>Cảnh báo trùng lặp giáo viên
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowDuplicateModal(false)}></button>
                            </div>
                            <div className="modal-body py-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                <div className="alert alert-info border-0 shadow-sm mb-4 small">
                                    Các giáo viên bên dưới đã tồn tại trong hệ thống. Thông tin của họ đã được cập nhật/ghi đè theo file Excel/CSV mới tải lên.
                                </div>
                                {Object.keys(duplicateGroups).map(cls => (
                                    <div key={cls} className="mb-3">
                                        <h6 className="fw-bold p-2 bg-light rounded text-dark">Lớp chủ nhiệm: {cls}</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle table-sm mb-0">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '150px' }}>Mã VNeID</th>
                                                        <th>Họ tên</th>
                                                        <th>Lớp chủ nhiệm</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {duplicateGroups[cls].map(item => (
                                                        <tr key={item.id_VNeID}>
                                                            <td><code>{item.id_VNeID}</code></td>
                                                            <td><strong>{item.name}</strong></td>
                                                            <td><span className="badge bg-secondary">{item.homeroom_class}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="modal-footer border-0 pt-0">
                                <button type="button" className="btn btn-primary px-4" style={{ background: '#00206d' }} onClick={() => setShowDuplicateModal(false)}>
                                    Đã hiểu & Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirm/Alert Modals */}
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
            {promptModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{promptModal.title}</h5>
                                <button type="button" className="btn-close" onClick={() => setPromptModal({ show: false, title: '', message: '', onConfirm: null })}></button>
                            </div>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                if (promptModal.onConfirm) promptModal.onConfirm(e.target.elements.promptInput.value);
                            }}>
                                <div className="modal-body p-4">
                                    <label className="form-label mb-2">{promptModal.message}</label>
                                    <input type="text" className="form-control" name="promptInput" autoFocus required />
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setPromptModal({ show: false, title: '', message: '', onConfirm: null })}>Đóng</button>
                                    <button type="submit" className="btn btn-primary">Xác nhận</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Cấp tài khoản hàng loạt cho Giáo viên */}
            {accountModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Cấp tài khoản giáo viên</h5>
                                <button type="button" className="btn-close" onClick={() => setAccountModal(prev => ({ ...prev, show: false }))} />
                            </div>
                            <div className="modal-body">
                                {accountModal.loading ? (
                                    <div className="text-center py-4"><div className="spinner-border text-primary" /><div className="mt-2 text-muted small">Đang tải...</div></div>
                                ) : accountModal.result ? (
                                    <div className={`alert ${accountModal.result.success ? 'alert-success' : 'alert-danger'}`}>{accountModal.result.text}</div>
                                ) : accountModal.teachers.length === 0 ? (
                                    <div className="alert alert-info">Tất cả giáo viên đã có tài khoản. Không cần cấp thêm.</div>
                                ) : (
                                    <>
                                        <p className="text-muted small mb-3">Danh sách giáo viên chưa được cấp tài khoản. Chọn những người cần cấp rồi bấm <strong>Cấp tài khoản</strong>. Mật khẩu mặc định: số CCCD.</p>
                                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: 6 }}>
                                            {accountModal.teachers.map(t => (
                                                <label key={t.id_VNeID} className="d-flex align-items-center gap-2 px-3 py-2 border-bottom" style={{ cursor: 'pointer', background: accountModal.checked.has(t.id_VNeID) ? '#f0f7ff' : 'transparent' }}>
                                                    <input type="checkbox" className="form-check-input m-0"
                                                        checked={accountModal.checked.has(t.id_VNeID)}
                                                        onChange={() => toggleAccountTeacher(t.id_VNeID)} />
                                                    <span className="fw-semibold">{t.name}</span>
                                                    <span className="badge bg-light text-dark border ms-auto">{t.id_VNeID}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="d-flex align-items-center gap-2 mt-2">
                                            <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                                                onClick={() => setAccountModal(prev => ({ ...prev, checked: new Set(prev.teachers.map(t => t.id_VNeID)) }))}>Chọn tất cả</button>
                                            <span className="text-muted">|</span>
                                            <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                                                onClick={() => setAccountModal(prev => ({ ...prev, checked: new Set() }))}>Bỏ chọn tất cả</button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setAccountModal(prev => ({ ...prev, show: false }))}>Đóng</button>
                                {!accountModal.loading && !accountModal.result && accountModal.teachers.length > 0 && (
                                    <button className="btn btn-primary" disabled={accountModal.checked.size === 0} onClick={submitCreateAccounts}>
                                        <i className="fas fa-user-shield me-1" />Cấp tài khoản ({accountModal.checked.size} giáo viên)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherManager;
