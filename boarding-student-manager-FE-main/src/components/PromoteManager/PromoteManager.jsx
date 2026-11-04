import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import ConfirmModal from '../common/ConfirmModal';

const PromoteManager = () => {
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [promoteExceptions, setPromoteExceptions] = useState(new Set());
    const [promoteDemotions, setPromoteDemotions] = useState(new Set());
    const [promoting, setPromoting] = useState(false);

    // Confirm/Alert modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));

    useEffect(() => {
        const user = getStoredUser();
        const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };
        const role = user?.role_name || roleMap[user?.role_id] || '';
        if (role !== 'manager') {
            navigate('/dashboard');
            return;
        }

        fetchStudents();
    }, [navigate]);

    const fetchStudents = () => {
        setLoading(true);
        fetch(apiUrl('/api/student'))
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setStudents(data.data);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const studentsByClass = useMemo(() => {
        const groups = {};
        students.forEach(s => {
            if (s.is_active) {
                const cls = s.class_name || 'Chưa xếp lớp';
                if (!groups[cls]) groups[cls] = [];
                groups[cls].push(s);
            }
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

    // Group classes by grade
    const classesByGrade = useMemo(() => {
        const grades = { '10': {}, '11': {}, '12': {}, 'Khác': {} };
        Object.keys(studentsByClass).forEach(cls => {
            const match = cls.match(/^(\d+)/);
            const grade = match ? match[1] : 'Khác';
            if (grade === '10') {
                grades['10'][cls] = studentsByClass[cls];
            } else if (grade === '11') {
                grades['11'][cls] = studentsByClass[cls];
            } else if (grade === '12') {
                grades['12'][cls] = studentsByClass[cls];
            } else {
                grades['Khác'][cls] = studentsByClass[cls];
            }
        });
        return grades;
    }, [studentsByClass]);

    const togglePromoteException = (studentId) => {
        setPromoteExceptions(prev => {
            const next = new Set(prev);
            if (next.has(studentId)) {
                next.delete(studentId);
            } else {
                next.add(studentId);
                // Mutually exclusive: remove from demotions
                setPromoteDemotions(dem => {
                    const newDem = new Set(dem);
                    newDem.delete(studentId);
                    return newDem;
                });
            }
            return next;
        });
    };

    const togglePromoteDemotion = (studentId) => {
        setPromoteDemotions(prev => {
            const next = new Set(prev);
            if (next.has(studentId)) {
                next.delete(studentId);
            } else {
                next.add(studentId);
                // Mutually exclusive: remove from exceptions
                setPromoteExceptions(ex => {
                    const newEx = new Set(ex);
                    newEx.delete(studentId);
                    return newEx;
                });
            }
            return next;
        });
    };

    const handlePromoteSubmit = () => {
        showConfirm(
            'Xác nhận lên lớp học sinh',
            'Hành động này sẽ tăng khối lớp cho tất cả học sinh (ngoại trừ học sinh ở lại lớp hoặc xuống lớp). Học sinh khối 12 sẽ ra trường và vô hiệu hoá tài khoản. Bạn có chắc chắn?',
            () => {
                closeConfirm();
                setPromoting(true);
                fetch(apiUrl('/api/student/promote'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        exceptions: Array.from(promoteExceptions),
                        demotions: Array.from(promoteDemotions)
                    })
                })
                .then(res => res.json())
                .then(data => {
                    setPromoting(false);
                    if (data.success) {
                        showAlert('Thành công', data.message || 'Lên lớp hàng loạt thành công!');
                        setPromoteExceptions(new Set());
                        setPromoteDemotions(new Set());
                        fetchStudents();
                    } else {
                        showAlert('Lỗi', data.error || data.message);
                    }
                })
                .catch(err => {
                    setPromoting(false);
                    showAlert('Lỗi', err.message || 'Lỗi hệ thống');
                });
            }
        );
    };

    return (
        <div style={{ padding: '24px' }}>
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <div>
                    <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>
                        <i className="fas fa-graduation-cap me-2"></i>Quy trình lên lớp hàng loạt
                    </h2>
                    <div className="text-muted mt-1">Quản lý và xét duyệt lên lớp cho học sinh toàn trường</div>
                </div>
                <button 
                    className="btn btn-primary px-4 shadow-sm" 
                    style={{ background: '#00206d', border: 'none', borderRadius: '8px' }} 
                    onClick={handlePromoteSubmit} 
                    disabled={promoting || loading || Object.keys(studentsByClass).length === 0}
                >
                    {promoting ? (
                        <>
                            <span className="spinner-border spinner-border-sm me-2"></span> Đang xử lý...
                        </>
                    ) : (
                        <>
                            <i className="fas fa-check-circle me-1"></i> Xác nhận lên lớp
                        </>
                    )}
                </button>
            </div>

            <div className="alert alert-warning border-0 shadow-sm mb-4" style={{ borderRadius: '12px', background: '#fff9db', borderLeft: '5px solid #f59f00' }}>
                <h6 className="fw-bold text-warning-emphasis"><i className="fas fa-exclamation-triangle me-1"></i> Lưu ý quan trọng:</h6>
                <ul className="mb-0 small text-muted" style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
                    <li>Hệ thống sẽ tự động xác định năm học tiếp theo và tạo các lớp mới tương ứng (ví dụ: khối 10 lên khối 11, khối 11 lên khối 12).</li>
                    <li>Tất cả học sinh khối 12 sẽ tốt nghiệp, tài khoản sẽ chuyển sang vô hiệu hóa.</li>
                    <li>Nếu có học sinh nào <strong>không đủ điều kiện lên lớp (ở lại lớp)</strong>, hãy tích chọn checkbox <strong>"Ở lại lớp"</strong>.</li>
                    <li>Nếu muốn <strong>xuống lớp</strong> đối với học sinh khối 11, 12, hãy tích chọn checkbox <strong>"Xuống lớp"</strong> (học sinh lớp 11 xuống khối 10, học sinh lớp 12 xuống khối 11).</li>
                </ul>
            </div>

            {loading ? (
                <div className="text-center py-5 text-muted">
                    <div className="spinner-border text-primary mb-3" style={{ color: '#00206d' }}></div>
                    <div>Đang tải danh sách học sinh...</div>
                </div>
            ) : Object.keys(studentsByClass).length === 0 ? (
                <div className="text-center py-5 text-muted bg-white rounded-3 shadow-sm">
                    <i className="fas fa-users-slash fa-3x mb-3 text-secondary"></i>
                    <div>Không có học sinh nào đang hoạt động.</div>
                </div>
            ) : (
                ['10', '11', '12', 'Khác'].map(gradeKey => {
                    const gradeClasses = classesByGrade[gradeKey];
                    if (Object.keys(gradeClasses).length === 0) return null;
                    return (
                        <div key={gradeKey} className="mb-5">
                            <h4 className="fw-bold border-bottom pb-2 mb-4" style={{ color: '#00206d', display: 'flex', alignItems: 'center' }}>
                                <i className="fas fa-layer-group me-2" style={{ fontSize: '1.2rem' }}></i>
                                Khối {gradeKey === 'Khác' ? 'khác' : gradeKey}
                            </h4>
                            <div className="row">
                                {Object.keys(gradeClasses).map(cls => {
                                    const isGrade11or12 = gradeKey === '11' || gradeKey === '12';
                                    return (
                                        <div key={cls} className="col-md-4 mb-4">
                                            <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                                <div className="p-3 d-flex justify-content-between align-items-center" style={{ background: '#f8faff', borderBottom: '1px solid #eef2f7' }}>
                                                    <span className="fw-bold" style={{ color: '#00206d' }}>Lớp {cls}</span>
                                                    <span className="badge bg-secondary-subtle text-secondary-emphasis rounded-pill px-2.5 py-1 small">{gradeClasses[cls].length} học sinh</span>
                                                </div>
                                                <div style={{ padding: '15px', flex: 1, maxHeight: '380px', overflowY: 'auto' }}>
                                                    <table className="table table-hover align-middle table-sm mb-0">
                                                        <thead>
                                                            <tr className="text-muted small">
                                                                <th style={{ width: '100px' }}>Mã VNeID</th>
                                                                <th>Họ tên</th>
                                                                <th className="text-center" style={{ width: '65px' }}>Ở lại</th>
                                                                {isGrade11or12 && (
                                                                    <th className="text-center" style={{ width: '65px' }}>Xuống</th>
                                                                )}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {gradeClasses[cls].map(s => (
                                                                <tr key={s.id_VNeID}>
                                                                    <td><code className="text-dark-emphasis">{s.id_VNeID}</code></td>
                                                                    <td><strong className="text-dark">{s.name}</strong></td>
                                                                    <td className="text-center">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            className="form-check-input"
                                                                            checked={promoteExceptions.has(s.id_VNeID)}
                                                                            onChange={() => togglePromoteException(s.id_VNeID)}
                                                                            style={{ cursor: 'pointer', width: '1.1rem', height: '1.1rem' }}
                                                                        />
                                                                    </td>
                                                                    {isGrade11or12 && (
                                                                        <td className="text-center">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                className="form-check-input"
                                                                                checked={promoteDemotions.has(s.id_VNeID)}
                                                                                onChange={() => togglePromoteDemotion(s.id_VNeID)}
                                                                                style={{ cursor: 'pointer', width: '1.1rem', height: '1.1rem' }}
                                                                            />
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}

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
                onConfirm={closeAlert}
                onCancel={closeAlert}
                type="alert"
            />
        </div>
    );
};

export default PromoteManager;
