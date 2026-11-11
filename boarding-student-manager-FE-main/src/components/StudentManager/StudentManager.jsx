import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import { getStoredUser, getUserRole } from '../../config/auth';
import ConfirmModal from '../common/ConfirmModal';
import { formatDate } from '../../utils/dateFormatter';

const API_STUDENT = apiUrl('/api/student');

const emptyStudent = {
    id_VNeID: '', name: '', sex: '0', birth: '', phone_number: '', email: '',
    permanent_address: '', temp_address: '', class_name: '',
    parent: { father_name: '', father_phone: '', mother_name: '', mother_phone: '' }
};

const StudentManager = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const classFilter = searchParams.get('class');
    const gradeFilter = searchParams.get('grade');

    const [students, setStudents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [showFormModal, setShowFormModal] = useState(false);
    const [selectedStudentImage, setSelectedStudentImage] = useState(null);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    
    const [form, setForm] = useState(emptyStudent);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentActivity, setStudentActivity] = useState(null);
    const [studentActivityLoading, setStudentActivityLoading] = useState(false);
    const [activityRange, setActivityRange] = useState('month');
    const [selectedIds, setSelectedIds] = useState([]);
    const [showParentInfo, setShowParentInfo] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [userRole, setUserRole] = useState('');
    
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadDuplicates, setUploadDuplicates] = useState([]);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const fileInputRef = useRef(null);

    // --- Account creation modal ---
    const [accountModal, setAccountModal] = useState({ show: false, classes: [], checked: new Set(), loading: false, result: null });

    // Confirm/Alert modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));
    const [promptModal, setPromptModal] = useState({ show: false, title: '', message: '', onConfirm: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState({ show: false, hardDelete: false });

    const fetchStudents = useCallback(() => {
        setLoading(true);
        const user = getStoredUser();
        const role = getUserRole(user);
        setUserRole(role);
        const teacherParam = role === 'teacher' && user?.username !== 'admin' ? `?teacher_id=${user.username}` : '';

        fetch(`${API_STUDENT}${teacherParam}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setStudents(data.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => { fetchStudents(); }, [fetchStudents]);

    const filteredStudents = useMemo(() => {
        let result = students;
        if (classFilter) {
            result = students.filter(s => s.class_name === classFilter);
        } else if (gradeFilter) {
            result = students.filter(s => (s.class_name || '').startsWith(gradeFilter));
        }
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            result = result.filter(s => 
                (s.name || '').toLowerCase().includes(term) ||
                (s.id_VNeID || '').toLowerCase().includes(term)
            );
        }
        return [...result].sort((a, b) => {
            // 1. Lớp
            const clsCmp = (a.class_name || '').localeCompare(b.class_name || '', 'vi', { numeric: true });
            if (clsCmp !== 0) return clsCmp;
            // 2. Tên (từ cuối)
            const partsA = (a.name || '').trim().split(' ');
            const partsB = (b.name || '').trim().split(' ');
            const tenA = partsA[partsA.length - 1] || '';
            const tenB = partsB[partsB.length - 1] || '';
            const tenCmp = tenA.localeCompare(tenB, 'vi');
            if (tenCmp !== 0) return tenCmp;
            // 3. Họ + tên đệm
            const prefixA = partsA.slice(0, -1).join(' ');
            const prefixB = partsB.slice(0, -1).join(' ');
            return prefixA.localeCompare(prefixB, 'vi');
        });
    }, [students, classFilter, gradeFilter, searchTerm]);

    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedIds(filteredStudents.map(s => s.id_VNeID));
        else setSelectedIds([]);
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleDelete = (id) => {
        showConfirm('Vô hiệu hoá', 'Bạn có chắc chắn muốn vô hiệu hoá học sinh này?', () => {
            closeConfirm();
            fetch(`${API_STUDENT}/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) { setShowViewModal(false); fetchStudents(); }
                    else showAlert('Lỗi', data.message || 'Lỗi khi vô hiệu hoá');
                });
        }, 'danger');
    };

    const openBulkDeleteModal = () => {
        if (selectedIds.length === 0) return;
        setBulkDeleteModal({ show: true, hardDelete: false });
    };

    const handleConfirmBulkDelete = () => {
        const isHard = bulkDeleteModal.hardDelete;
        setBulkDeleteModal({ show: false, hardDelete: false });

        fetch(`${API_STUDENT}/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, hard_delete: isHard })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showAlert('Thành công', data.message || 'Đã xoá học sinh thành công');
                    setSelectedIds([]);
                    fetchStudents();
                } else {
                    showAlert('Lỗi', data.error || data.message || 'Lỗi khi xoá học sinh');
                }
            })
            .catch(() => showAlert('Lỗi', 'Không thể kết nối đến máy chủ'));
    };

    const handleEdit = (student) => {
        // Fix ngày sinh: Convert về định dạng YYYY-MM-DD cho <input type="date">
        let birthDate = '';
        if (student.birth) {
            const dateObj = new Date(student.birth);
            if (!isNaN(dateObj.getTime())) {
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                birthDate = `${year}-${month}-${day}`;
            }
        }

        const formData = {
            ...student,
            birth: birthDate,
            parent: {
                father_name: student.father_name || '',
                father_phone: student.father_phone || '',
                mother_name: student.mother_name || '',
                mother_phone: student.mother_phone || ''
            }
        };
        setForm(formData);
        setSelectedStudentImage(null);
        setError('');
        setShowParentInfo(!!(student.father_name || student.mother_name));
        setShowViewModal(false);
        setShowFormModal(true);
    };

    const handleSave = (e) => {
        e.preventDefault();
        setSubmitting(true);
        const isUpdate = !!students.find(s => s.id_VNeID === form.id_VNeID);
        const url = isUpdate ? `${API_STUDENT}/${form.id_VNeID}` : `${API_STUDENT}/`;
        const method = isUpdate ? 'PUT' : 'POST';

        const user = getStoredUser();

        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (selectedStudentImage && (userRole === 'manager' || userRole === 'teacher')) {
                        const formData = new FormData();
                        formData.append('image', selectedStudentImage);
                        formData.append('username', user?.username || '');

                        fetch(`${API_STUDENT}/${form.id_VNeID}/upload_image`, {
                            method: 'POST',
                            body: formData
                        })
                        .then(res => res.json())
                        .then(uploadData => {
                            setSubmitting(false);
                            if (uploadData.success) {
                                setSelectedStudentImage(null);
                                setShowFormModal(false);
                                fetchStudents();
                            } else {
                                setError(`Đã lưu thông tin học sinh nhưng không tải được ảnh: ${uploadData.message || uploadData.error}`);
                            }
                        })
                        .catch(() => {
                            setSubmitting(false);
                            setError('Đã lưu thông tin học sinh nhưng gặp lỗi kết nối khi tải ảnh');
                        });
                    } else {
                        setSubmitting(false);
                        setSelectedStudentImage(null);
                        setShowFormModal(false);
                        fetchStudents();
                    }
                }
                else {
                    setSubmitting(false);
                    setError(data.error || 'Có lỗi xảy ra');
                }
            })
            .catch(() => { setSubmitting(false); setError('Lỗi kết nối'); });
    };

    const handleCreateAccounts = () => {
        setAccountModal({ show: true, classes: [], checked: new Set(), loading: true, result: null });
        fetch(`${API_STUDENT}/classes-without-accounts`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const classes = data.data || [];
                    setAccountModal(prev => ({
                        ...prev, loading: false,
                        classes,
                        checked: new Set(classes.map(c => c.class_name)),
                    }));
                } else {
                    setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: data.error || 'Lỗi tải danh sách lớp' } }));
                }
            })
            .catch(() => setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: 'Lỗi kết nối server' } })));
    };

    const submitCreateAccounts = () => {
        const classNames = [...accountModal.checked];
        setAccountModal(prev => ({ ...prev, loading: true, result: null }));
        fetch(`${API_STUDENT}/create-accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ class_names: classNames }),
        })
            .then(res => res.json())
            .then(data => {
                setAccountModal(prev => ({ ...prev, loading: false, result: { success: data.success, text: data.message || data.error } }));
                if (data.success) fetchStudents();
            })
            .catch(() => setAccountModal(prev => ({ ...prev, loading: false, result: { success: false, text: 'Lỗi kết nối server' } })));
    };

    const toggleAccountClass = (name) => {
        setAccountModal(prev => {
            const next = new Set(prev.checked);
            if (next.has(name)) next.delete(name); else next.add(name);
            return { ...prev, checked: next };
        });
    };

    const fetchStudentActivity = useCallback((studentId, range = activityRange) => {
        if (!studentId) return;
        setStudentActivityLoading(true);
        setStudentActivity(null);
        fetch(`${API_STUDENT}/${studentId}/activity?range=${range}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setStudentActivity(data.data);
                else setStudentActivity(null);
                setStudentActivityLoading(false);
            })
            .catch(() => {
                setStudentActivity(null);
                setStudentActivityLoading(false);
            });
    }, [activityRange]);

    const handleView = (student) => {
        setSelectedStudent(student);
        setShowViewModal(true);
        fetchStudentActivity(student.id_VNeID, activityRange);
    };

    useEffect(() => {
        if (showViewModal && selectedStudent) {
            fetchStudentActivity(selectedStudent.id_VNeID, activityRange);
        }
    }, [activityRange, showViewModal, selectedStudent, fetchStudentActivity]);

    const handleResetPassword = (student) => {
        setPromptModal({
            show: true,
            title: 'Cấp lại mật khẩu',
            message: `Nhập mật khẩu mới cho học sinh ${student.name} (${student.id_VNeID}):`,
            onConfirm: (newPassword) => {
                setPromptModal({ show: false, title: '', message: '', onConfirm: null });
                if (!newPassword) return;

                fetch(apiUrl(`/api/login/reset-password/${student.id_VNeID}`), {
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

    // --- File Import / Export Handlers ---
    const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
    const onDragLeave = useCallback(() => setDragOver(false), []);
    const onDrop = useCallback((e) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) { 
            setSelectedFile(file); 
            setUploadResult(null); 
        }
    }, []);
    const handleUpload = () => {
        if (!selectedFile) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        fetch(`${API_STUDENT}/upload`, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                setUploading(false);
                if (data.success) {
                    setSelectedFile(null);
                    fetchStudents();
                    if (data.duplicates && data.duplicates.length > 0) {
                        setUploadDuplicates(data.duplicates);
                        setShowDuplicateModal(true);
                        setShowUploadModal(false);
                    } else {
                        setUploadResult({ success: true, message: data.message });
                    }
                } else {
                    setUploadResult({ success: false, message: data.message || data.error });
                }
            }).catch(() => { setUploading(false); setUploadResult({ success: false, message: 'Lỗi kết nối' }); });
    };
    const studentsByClass = useMemo(() => {
        const groups = {};
        students.forEach(s => {
            const cls = s.class_name || 'Chưa xếp lớp';
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(s);
        });
        const sortedClasses = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
        const sortedGroups = {};
        sortedClasses.forEach(cls => {
            sortedGroups[cls] = groups[cls].sort((a, b) => {
                const partsA = (a.name || '').trim().split(' ');
                const partsB = (b.name || '').trim().split(' ');
                const tenA = partsA[partsA.length - 1] || '';
                const tenB = partsB[partsB.length - 1] || '';
                return tenA.localeCompare(tenB, 'vi');
            });
        });
        return sortedGroups;
    }, [students]);

    const duplicateGroups = useMemo(() => {
        const groups = {};
        uploadDuplicates.forEach(item => {
            const cls = item.class || 'Chưa xếp lớp';
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(item);
        });
        return groups;
    }, [uploadDuplicates]);

    return (
        <div style={{ padding: '20px' }}>
            <style>{`
                @media (max-width: 768px) {
                    .student-toolbar { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
                    .student-toolbar-btns { flex-wrap: wrap !important; gap: 6px !important; }
                    .student-toolbar-btns .btn { flex: 1 1 auto; min-width: 110px; }
                    .student-col-hide { display: none !important; }
                }
            `}</style>
            <div className="student-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px' }}>
                <div>
                    <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>Quản lý Học sinh</h2>
                    {classFilter && <div className="mt-1 text-muted">Lớp: <strong>{classFilter}</strong></div>}
                </div>
                <div className="student-toolbar-btns" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {userRole === 'manager' && (
                        <button className="btn btn-outline-primary" onClick={() => navigate('/promote')} title="Quy trình lên lớp hàng loạt">
                            <i className="fas fa-graduation-cap me-1"></i><span className="d-none d-sm-inline">Lên lớp</span><span className="d-sm-none">Lên lớp</span>
                        </button>
                    )}
                    <button className="btn btn-outline-info" onClick={handleCreateAccounts} title="Cấp tài khoản cho học sinh chưa có">
                        <i className="fas fa-user-shield me-1"></i><span className="d-none d-sm-inline">Cấp tài khoản</span><span className="d-sm-none">TK</span>
                    </button>
                    <button className="btn btn-outline-secondary" onClick={() => window.location.href = `${API_STUDENT}/template`} title="Tải file mẫu Excel">
                        <i className="fas fa-download me-1"></i><span className="d-none d-sm-inline">Mẫu Excel</span>
                    </button>
                    <button className="btn btn-outline-success" onClick={() => window.location.href = `${API_STUDENT}/export`} title="Xuất danh sách học sinh ra Excel">
                        <i className="fas fa-file-excel me-1"></i><span className="d-none d-sm-inline">Xuất Excel</span>
                    </button>
                    <button className="btn btn-success" onClick={() => setShowUploadModal(true)}>
                        <i className="fas fa-file-import me-1"></i> Nhập Excel
                    </button>
                    <button className="btn btn-primary" style={{ background: '#00206d' }} onClick={() => { setForm(emptyStudent); setSelectedStudentImage(null); setShowFormModal(true); setShowParentInfo(false); setError(''); }}>
                        <i className="fas fa-plus me-1"></i> Thêm mới
                    </button>
                </div>
            </div>

            <div className="mb-3" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div className="position-relative" style={{ width: '100%', maxWidth: '350px' }}>
                    <i className="fas fa-search position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}></i>
                    <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Tìm kiếm họ tên hoặc mã VNeID..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        style={{ paddingLeft: '35px' }}
                    />
                </div>
            </div>

            {selectedIds.length > 0 && (
                <div className="alert alert-info d-flex justify-content-between align-items-center mb-3">
                    <span>Đã chọn <strong>{selectedIds.length}</strong> học sinh</span>
                    <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
                        <button className="btn btn-sm btn-danger" onClick={openBulkDeleteModal}>
                            <i className="far fa-trash-alt me-1"></i> Xoá mục đã chọn ({selectedIds.length})
                        </button>
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <div className="table-responsive-x">
                    <table className="table table-hover mb-0" style={{ minWidth: '500px' }}>
                        <thead style={{ background: '#f8faff', borderBottom: '2px solid #eef2f7' }}>
                            <tr>
                                <th style={{ width: '40px', paddingLeft: '20px' }}>
                                    <input type="checkbox" className="form-check-input" onChange={handleSelectAll} checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0} />
                                </th>
                                <th className="student-col-hide">Mã VNeID</th>
                                <th>Họ và Tên</th>
                                <th>Lớp</th>
                                <th className="student-col-hide">Giới tính</th>
                                <th>Ngày sinh</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="text-center py-5 text-muted">Đang tải dữ liệu...</td></tr>
                            ) : filteredStudents.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-5 text-muted">Không tìm thấy học sinh nào.</td></tr>
                            ) : filteredStudents.map(s => (
                                <tr key={s.id_VNeID} style={{ cursor: 'pointer' }}>
                                    <td onClick={(e) => e.stopPropagation()} style={{ paddingLeft: '20px' }}>
                                        <input type="checkbox" className="form-check-input" checked={selectedIds.includes(s.id_VNeID)} onChange={() => handleSelectOne(s.id_VNeID)} />
                                    </td>
                                    <td className="student-col-hide" onClick={() => handleView(s)}>{s.id_VNeID}</td>
                                    <td onClick={() => handleView(s)}>{s.name}</td>
                                    <td onClick={() => handleView(s)}><span className="badge bg-light text-dark border">{s.class_name || '—'}</span></td>
                                    <td className="student-col-hide" onClick={() => handleView(s)}>{s.sex === 1 ? 'Nữ' : 'Nam'}</td>
                                    <td onClick={() => handleView(s)}>{formatDate(s.birth)}</td>
                                    <td>
                                        <button className="btn btn-sm btn-light me-1" title="Xem" onClick={() => handleView(s)}><i className="far fa-eye text-primary"></i></button>
                                        <button className="btn btn-sm btn-light me-1" title="Sửa" onClick={() => handleEdit(s)}><i className="far fa-edit text-success"></i></button>
                                        {(userRole === 'manager' || userRole === 'admin') && (
                                            <button className="btn btn-sm btn-light" title="Vô hiệu hoá" onClick={() => handleDelete(s.id_VNeID)}><i className="far fa-trash-alt text-danger"></i></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Chi tiết Học sinh */}
            {showViewModal && selectedStudent && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered">
                        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '15px' }}>
                            <div className="modal-header border-0 pb-0">
                                <h5 className="modal-title fw-bold" style={{ color: '#00206d' }}>Thông tin chi tiết học sinh</h5>
                                <button type="button" className="btn-close" onClick={() => setShowViewModal(false)}></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="row">
                                    <div className="col-md-4 text-center border-end">
                                        <div style={{ 
                                            width: '120px', 
                                            height: '160px', 
                                            background: '#f0f2f5', 
                                            borderRadius: '8px', 
                                            margin: '0 auto 15px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            border: '2px solid #00206d'
                                        }}>
                                            {selectedStudent.image_url ? (
                                                <img 
                                                    src={selectedStudent.image_url} 
                                                    alt={selectedStudent.name} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                    onError={(e) => { e.target.src = '/assets/img/no-avatar.png'; }}
                                                />
                                            ) : (
                                                <i className="fas fa-user-graduate fa-4x text-secondary"></i>
                                            )}
                                        </div>
                                        <h5 className="fw-bold mb-1">{selectedStudent.name}</h5>
                                        <p className="text-muted small mb-3">{selectedStudent.id_VNeID}</p>
                                        <span className={`badge ${selectedStudent.is_active ? 'bg-success' : 'bg-danger'} mb-3`}>
                                            {selectedStudent.is_active ? 'Đang hoạt động' : 'Vô hiệu hoá'}
                                        </span>
                                    </div>
                                    <div className="col-md-8 ps-4">
                                        <h6 className="fw-bold border-bottom pb-2 mb-3">Thông tin cơ bản</h6>
                                        <div className="row mb-2">
                                            <div className="col-4 text-muted">Ngày sinh:</div>
                                            <div className="col-8 fw-500">{formatDate(selectedStudent.birth)}</div>
                                        </div>
                                        <div className="row mb-2">
                                            <div className="col-4 text-muted">Giới tính:</div>
                                            <div className="col-8 fw-500">{selectedStudent.sex === 1 ? 'Nữ' : 'Nam'}</div>
                                        </div>
                                        <div className="row mb-2">
                                            <div className="col-4 text-muted">Số điện thoại:</div>
                                            <div className="col-8 fw-500">{selectedStudent.phone_number || '—'}</div>
                                        </div>
                                        <div className="row mb-2">
                                            <div className="col-4 text-muted">Email:</div>
                                            <div className="col-8 fw-500">{selectedStudent.email || '—'}</div>
                                        </div>
                                        <div className="row mb-2">
                                            <div className="col-4 text-muted">Lớp học:</div>
                                            <div className="col-8"><span className="badge bg-primary">{selectedStudent.class_name || 'Chưa xếp lớp'}</span></div>
                                        </div>
                                        <div className="row mb-3">
                                            <div className="col-4 text-muted">Địa chỉ:</div>
                                            <div className="col-8 fw-500">{selectedStudent.permanent_address || '—'}</div>
                                        </div>

                                        <h6 className="fw-bold border-bottom pb-2 mb-3 mt-4">Thông tin người thân</h6>
                                        <div className="row mb-2">
                                            <div className="col-6">
                                                <div className="text-muted small">Họ tên bố:</div>
                                                <div className="fw-500">{selectedStudent.father_name || '—'}</div>
                                                <div className="text-muted small mt-1">SĐT bố:</div>
                                                <div className="fw-500">{selectedStudent.father_phone || '—'}</div>
                                            </div>
                                            <div className="col-6">
                                                <div className="text-muted small">Họ tên mẹ:</div>
                                                <div className="fw-500">{selectedStudent.mother_name || '—'}</div>
                                                <div className="text-muted small mt-1">SĐT mẹ:</div>
                                                <div className="fw-500">{selectedStudent.mother_phone || '—'}</div>
                                            </div>
                                        </div>

                                        <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3 mt-4">
                                            <h6 className="fw-bold mb-0">Lỗi vi phạm KTX</h6>
                                            <select
                                                className="form-select form-select-sm"
                                                style={{ width: '150px' }}
                                                value={activityRange}
                                                onChange={(e) => setActivityRange(e.target.value)}
                                            >
                                                <option value="week">Tuần này</option>
                                                <option value="month">Tháng này</option>
                                            </select>
                                        </div>
                                        {studentActivityLoading ? (
                                            <div className="text-muted small">Đang tải thông tin lỗi vi phạm...</div>
                                        ) : (
                                            <div>
                                                <div className="small fw-bold mb-2">
                                                    Lỗi vi phạm ({studentActivity?.total_violations || 0}) - trừ {studentActivity?.total_penalty || 0} điểm
                                                </div>
                                                <div className="border rounded" style={{ maxHeight: '210px', overflowY: 'auto' }}>
                                                    {!studentActivity?.violations?.length ? (
                                                        <div className="p-3 text-muted small">Không có lỗi vi phạm trong kỳ đang chọn</div>
                                                    ) : studentActivity.violations.map((item, index) => (
                                                        <div key={`${item.inspection_date}-${item.criteria_name}-${index}`} className="p-2 border-bottom">
                                                            <div className="small fw-bold">{item.criteria_name}</div>
                                                            <div className="small text-muted">{item.inspection_date} | {item.room_name}</div>
                                                            <div className="small text-danger">-{item.penalty_points} điểm</div>
                                                            {item.note && <div className="small text-muted">{item.note}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer border-0 p-4">
                                {userRole === 'manager' && (
                                    <button className="btn btn-outline-warning" onClick={() => handleResetPassword(selectedStudent)}>Cấp lại mật khẩu</button>
                                )}
                                {userRole === 'manager' && (
                                    <button className="btn btn-outline-danger" onClick={() => handleDelete(selectedStudent.id_VNeID)}>Vô hiệu hoá</button>
                                )}
                                <button className="btn btn-outline-primary" onClick={() => handleEdit(selectedStudent)}>Chỉnh sửa</button>
                                <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>Đóng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Form Thêm/Sửa */}
            {showFormModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered">
                        <div className="modal-content" style={{ borderRadius: '15px' }}>
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{form.id_VNeID && students.some(s=>s.id_VNeID===form.id_VNeID) ? 'Cập nhật thông tin' : 'Thêm học sinh mới'}</h5>
                                <button type="button" className="btn-close" onClick={() => setShowFormModal(false)}></button>
                            </div>
                            <form onSubmit={handleSave} className="modal-body p-4">
                                {error && <div className="alert alert-danger">{error}</div>}
                                <div className="row mb-3">
                                    <div className="col-md-3 text-center border-end">
                                        <label className="form-label fw-bold small d-block">Ảnh chân dung</label>
                                        <div style={{ 
                                            position: 'relative', 
                                            width: '120px', 
                                            height: '160px', 
                                            margin: '0 auto 10px', 
                                            borderRadius: '8px', 
                                            border: '2px dashed #00206d', 
                                            overflow: 'hidden', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            background: '#f8f9fa' 
                                        }}>
                                            {selectedStudentImage ? (
                                                <img src={URL.createObjectURL(selectedStudentImage)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : form.image_url ? (
                                                <img src={form.image_url} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '/assets/img/no-avatar.png'; }} />
                                            ) : (
                                                <i className="fas fa-user-graduate fa-3x text-secondary"></i>
                                            )}
                                        </div>
                                        {(userRole === 'manager' || userRole === 'teacher') ? (
                                            <>
                                                <button type="button" className="btn btn-sm btn-outline-secondary w-100" onClick={() => document.getElementById('student-photo-input').click()}>
                                                    Chọn ảnh
                                                </button>
                                                <input 
                                                    id="student-photo-input" 
                                                    type="file" 
                                                    accept="image/*" 
                                                    style={{ display: 'none' }} 
                                                    onChange={(e) => {
                                                        const file = e.target.files[0];
                                                        if (file) setSelectedStudentImage(file);
                                                    }} 
                                                />
                                            </>
                                        ) : (
                                            <span className="text-muted small">Không có quyền sửa ảnh</span>
                                        )}
                                    </div>
                                    <div className="col-md-9">
                                        <div className="row mb-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold small">Số CCCD (Mã VNeID) *</label>
                                                <input className="form-control" name="id_VNeID" value={form.id_VNeID} onChange={(e) => setForm({...form, id_VNeID: e.target.value})} disabled={students.some(s=>s.id_VNeID===form.id_VNeID)} required />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold small">Họ và Tên *</label>
                                                <input className="form-control" name="name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
                                            </div>
                                        </div>
                                        <div className="row mb-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold small">Ngày sinh</label>
                                                <input type="date" lang="en-GB" className="form-control" name="birth" value={form.birth} onChange={(e) => setForm({...form, birth: e.target.value})} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold small">Giới tính</label>
                                                <select className="form-control" name="sex" value={form.sex} onChange={(e) => setForm({...form, sex: parseInt(e.target.value)})}>
                                                    <option value="0">Nam</option>
                                                    <option value="1">Nữ</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="row mb-3">
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold small">Lớp</label>
                                        <input className="form-control" name="class_name" value={form.class_name} onChange={(e) => setForm({...form, class_name: e.target.value})} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold small">Số điện thoại</label>
                                        <input className="form-control" name="phone_number" value={form.phone_number} onChange={(e) => setForm({...form, phone_number: e.target.value})} />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold small">Email</label>
                                        <input className="form-control" name="email" value={form.email || ''} onChange={(e) => setForm({...form, email: e.target.value})} />
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label fw-bold small">Địa chỉ thường trú</label>
                                    <input className="form-control" name="permanent_address" value={form.permanent_address} onChange={(e) => setForm({...form, permanent_address: e.target.value})} />
                                </div>

                                <button type="button" className="btn btn-sm btn-outline-info mb-3" onClick={() => setShowParentInfo(!showParentInfo)}>
                                    {showParentInfo ? '− Thu gọn thông tin người thân' : '+ Thông tin người thân'}
                                </button>

                                {showParentInfo && (
                                    <div className="p-3 bg-light rounded border">
                                        <div className="row mb-2">
                                            <div className="col-md-6">
                                                <label className="small">Họ tên Bố</label>
                                                <input className="form-control form-control-sm" value={form.parent.father_name} onChange={(e) => setForm({...form, parent: {...form.parent, father_name: e.target.value}})} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small">SĐT Bố</label>
                                                <input className="form-control form-control-sm" value={form.parent.father_phone} onChange={(e) => setForm({...form, parent: {...form.parent, father_phone: e.target.value}})} />
                                            </div>
                                        </div>
                                        <div className="row">
                                            <div className="col-md-6">
                                                <label className="small">Họ tên Mẹ</label>
                                                <input className="form-control form-control-sm" value={form.parent.mother_name} onChange={(e) => setForm({...form, parent: {...form.parent, mother_name: e.target.value}})} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small">SĐT Mẹ</label>
                                                <input className="form-control form-control-sm" value={form.parent.mother_phone} onChange={(e) => setForm({...form, parent: {...form.parent, mother_phone: e.target.value}})} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 text-end">
                                    <button type="button" className="btn btn-secondary me-2" onClick={() => setShowFormModal(false)}>Huỷ</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting ? 'Đang lưu...' : 'Lưu thông tin'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Nhập từ file Excel / CSV</h5>
                                <button type="button" className="btn-close" onClick={() => setShowUploadModal(false)}></button>
                            </div>
                            <div className="modal-body p-4 text-center">
                                <div 
                                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ border: `2px dashed ${dragOver ? '#00206d' : '#ccc'}`, borderRadius: '10px', padding: '40px 20px', cursor: 'pointer', background: '#f8f9fa' }}
                                >
                                    <input ref={fileInputRef} type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={(e) => setSelectedFile(e.target.files[0])} />
                                    {selectedFile ? <div className="text-success fw-bold">📄 {selectedFile.name}</div> : 'Kéo thả hoặc click để chọn file Excel (.xlsx) hoặc CSV'}
                                </div>
                                {uploadResult && <div className={`alert mt-3 ${uploadResult.success ? 'alert-success' : 'alert-danger'}`}>{uploadResult.message}</div>}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>Đóng</button>
                                <button className="btn btn-success" onClick={handleUpload} disabled={!selectedFile || uploading}>{uploading ? 'Đang xử lý...' : 'Tải lên'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Account Creation Modal */}
            {accountModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Cấp tài khoản học sinh</h5>
                                <button type="button" className="btn-close" onClick={() => setAccountModal(prev => ({ ...prev, show: false }))} />
                            </div>
                            <div className="modal-body">
                                {accountModal.loading ? (
                                    <div className="text-center py-4"><div className="spinner-border text-primary" /><div className="mt-2 text-muted small">Đang tải...</div></div>
                                ) : accountModal.result ? (
                                    <div className={`alert ${accountModal.result.success ? 'alert-success' : 'alert-danger'}`}>{accountModal.result.text}</div>
                                ) : accountModal.classes.length === 0 ? (
                                    <div className="alert alert-info">Tất cả học sinh đã có tài khoản. Không cần cấp thêm.</div>
                                ) : (
                                    <>
                                        <p className="text-muted small mb-3">Các lớp bên dưới có học sinh chưa được cấp tài khoản. Chọn lớp cần cấp rồi bấm <strong>Cấp tài khoản</strong>. Mật khẩu mặc định: <code>123456</code>.</p>
                                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: 6 }}>
                                            {accountModal.classes.map(c => (
                                                <label key={c.class_name} className="d-flex align-items-center gap-2 px-3 py-2 border-bottom" style={{ cursor: 'pointer', background: accountModal.checked.has(c.class_name) ? '#f0f7ff' : 'transparent' }}>
                                                    <input type="checkbox" className="form-check-input m-0"
                                                        checked={accountModal.checked.has(c.class_name)}
                                                        onChange={() => toggleAccountClass(c.class_name)} />
                                                    <span className="fw-semibold">Lớp {c.class_name}</span>
                                                    <span className="badge bg-warning text-dark ms-auto">{c.student_count} HS</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="d-flex align-items-center gap-2 mt-2">
                                            <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                                                onClick={() => setAccountModal(prev => ({ ...prev, checked: new Set(prev.classes.map(c => c.class_name)) }))}>Chọn tất cả</button>
                                            <span className="text-muted">|</span>
                                            <button type="button" className="btn btn-sm btn-link p-0 text-decoration-none"
                                                onClick={() => setAccountModal(prev => ({ ...prev, checked: new Set() }))}>Bỏ chọn tất cả</button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setAccountModal(prev => ({ ...prev, show: false }))}>Đóng</button>
                                {!accountModal.loading && !accountModal.result && accountModal.classes.length > 0 && (
                                    <button className="btn btn-primary" disabled={accountModal.checked.size === 0} onClick={submitCreateAccounts}>
                                        <i className="fas fa-user-shield me-1" />Cấp tài khoản ({accountModal.checked.size} lớp)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Promote Modal removed */}
            {showDuplicateModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '15px' }}>
                            <div className="modal-header border-0 pb-0">
                                <h5 className="modal-title fw-bold text-warning">
                                    <i className="fas fa-exclamation-triangle me-2"></i>Cảnh báo trùng lặp học sinh
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowDuplicateModal(false)}></button>
                            </div>
                            <div className="modal-body py-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                <div className="alert alert-info border-0 shadow-sm mb-4 small">
                                    Các học sinh bên dưới đã tồn tại trong hệ thống. Thông tin của họ đã được cập nhật/ghi đè theo file Excel/CSV mới tải lên.
                                </div>
                                {Object.keys(duplicateGroups).map(cls => (
                                    <div key={cls} className="mb-3">
                                        <h6 className="fw-bold p-2 bg-light rounded text-dark">Lớp {cls}</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle table-sm mb-0">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '150px' }}>Mã VNeID</th>
                                                        <th>Họ tên</th>
                                                        <th>Lớp</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {duplicateGroups[cls].map(item => (
                                                        <tr key={item.id_VNeID}>
                                                            <td><code>{item.id_VNeID}</code></td>
                                                            <td><strong>{item.name}</strong></td>
                                                            <td><span className="badge bg-secondary">{item.class}</span></td>
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
            {/* Bulk Delete Modal */}
            {bulkDeleteModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold text-danger">
                                    <i className="fas fa-exclamation-triangle me-2"></i>
                                    Xác nhận xoá hàng loạt ({selectedIds.length} học sinh)
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setBulkDeleteModal({ show: false, hardDelete: false })}></button>
                            </div>
                            <div className="modal-body p-4">
                                <p className="mb-3">Vui lòng chọn hình thức xoá cho <strong>{selectedIds.length}</strong> học sinh đã chọn:</p>
                                
                                <div className="card mb-3 p-3 border-primary" style={{ cursor: 'pointer', background: !bulkDeleteModal.hardDelete ? '#f0f5ff' : '#fff' }} onClick={() => setBulkDeleteModal(prev => ({ ...prev, hardDelete: false }))}>
                                    <div className="form-check">
                                        <input className="form-check-input" type="radio" name="deleteType" id="softDeleteRadio" checked={!bulkDeleteModal.hardDelete} onChange={() => setBulkDeleteModal(prev => ({ ...prev, hardDelete: false }))} />
                                        <label className="form-check-label fw-bold text-primary" htmlFor="softDeleteRadio" style={{ cursor: 'pointer' }}>
                                            Xoá mềm (Chuyển vào Thùng rác - Khuyên dùng)
                                        </label>
                                    </div>
                                    <div className="text-muted small ps-4 mt-1">
                                        Ẩn học sinh khỏi danh sách và khoá tài khoản (cập nhật <code>is_active = 0</code> trong MySQL). Dữ liệu được lưu trong Thùng rác và có thể khôi phục bất cứ lúc nào.
                                    </div>
                                </div>

                                <div className="card p-3 border-danger" style={{ cursor: 'pointer', background: bulkDeleteModal.hardDelete ? '#fff0f0' : '#fff' }} onClick={() => setBulkDeleteModal(prev => ({ ...prev, hardDelete: true }))}>
                                    <div className="form-check">
                                        <input className="form-check-input" type="radio" name="deleteType" id="hardDeleteRadio" checked={bulkDeleteModal.hardDelete} onChange={() => setBulkDeleteModal(prev => ({ ...prev, hardDelete: true }))} />
                                        <label className="form-check-label fw-bold text-danger" htmlFor="hardDeleteRadio" style={{ cursor: 'pointer' }}>
                                            Xoá vĩnh viễn khỏi MySQL (Xoá hoàn toàn khỏi DB)
                                        </label>
                                    </div>
                                    <div className="text-muted small ps-4 mt-1">
                                        <strong>CẢNH BÁO:</strong> Xoá hoàn toàn bản ghi khỏi các bảng trong MySQL (học sinh, tài khoản, lưu trú, lớp học, nghỉ phép...). Bảng MySQL sẽ không còn bất kỳ thông tin nào của các học sinh này và <em>không thể khôi phục</em>.
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setBulkDeleteModal({ show: false, hardDelete: false })}>Huỷ</button>
                                <button type="button" className={`btn ${bulkDeleteModal.hardDelete ? 'btn-danger' : 'btn-primary'}`} onClick={handleConfirmBulkDelete}>
                                    {bulkDeleteModal.hardDelete ? 'Xoá vĩnh viễn khỏi MySQL' : 'Xác nhận chuyển vào thùng rác'}
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
        </div>
    );
};

export default StudentManager;
