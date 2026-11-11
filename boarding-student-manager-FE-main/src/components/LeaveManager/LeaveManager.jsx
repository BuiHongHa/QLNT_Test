import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser, getUserRole } from '../../config/auth';
import { useMockToday } from '../../hooks/useMockToday';
import ConfirmModal from '../common/ConfirmModal';
import DateRangePicker from '../common/DateRangePicker';

const API_LEAVE = apiUrl('/api/leave');
const API_STUDENT = apiUrl('/api/student');

const typeLabel = {
    REGULAR_WEEKEND: 'Về phép thường xuyên',
    AFTER_SCHOOL: 'Ra ngoài sau giờ học',
    EMERGENCY: 'Về phép đột xuất',
};

const statusLabel = {
    PENDING: 'Chờ duyệt',
    OVERDUE: 'Quá hạn',
    ACCEPTED: 'Được duyệt',
    DENIED: 'Không được duyệt',
};

const statusClass = {
    PENDING: 'bg-secondary',
    OVERDUE: 'bg-warning text-dark',
    ACCEPTED: 'bg-success',
    DENIED: 'bg-danger',
};

const LeaveManager = () => {
    const user = getStoredUser() || {};
    const roleName = getUserRole(user);
    const isStaff = ['teacher', 'manager', 'dorm_manager'].includes(roleName);

    // Sort: lớp -> tên (last word) -> họ + tên đệm (rest)
    const sortViName = (a, b) => {
        const clsA = a.class_name || '';
        const clsB = b.class_name || '';
        const clsCmp = clsA.localeCompare(clsB, 'vi', { numeric: true });
        if (clsCmp !== 0) return clsCmp;
        const partsA = (a.name || '').trim().split(' ');
        const partsB = (b.name || '').trim().split(' ');
        const tenA = partsA[partsA.length - 1] || '';
        const tenB = partsB[partsB.length - 1] || '';
        const tenCmp = tenA.localeCompare(tenB, 'vi');
        if (tenCmp !== 0) return tenCmp;
        const prefixA = partsA.slice(0, -1).join(' ');
        const prefixB = partsB.slice(0, -1).join(' ');
        return prefixA.localeCompare(prefixB, 'vi');
    };

    const [requests, setRequests] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'status', direction: 'asc' });
    // Default: lọc tuần hiện tại
    const getWeekBounds = () => {
        const now = new Date();
        const day = now.getDay();
        const diffToMon = (day === 0 ? -6 : 1 - day);
        const mon = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0, 0, 0, 0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return [fmt(mon), fmt(sun)];
    };
    const [weekStart, weekEnd] = getWeekBounds();
    const [dateRange, setDateRange] = useState({ start: weekStart, end: weekEnd });
    const [classFilter, setClassFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [detailItem, setDetailItem] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [studentClassFilter, setStudentClassFilter] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const mockToday = useMockToday(); // YYYY-MM-DD từ backend (thật hoặc ảo)

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));

    // Reject modal state (UC12 & Alternative Flow 12b)
    const QUICK_REJECT_REASONS = [
        'Trùng lịch thi / khảo sát tập trung bắt buộc của trường',
        'Chưa có giấy xác nhận hoặc cuộc gọi bảo lãnh từ phụ huynh',
        'Học sinh vi phạm nề nếp KTX trong tuần chưa được xóa lỗi',
        'Thời gian xin nghỉ không phù hợp với quy định nội trú'
    ];
    const [rejectModal, setRejectModal] = useState({ show: false, item: null, isWeekly: false, reason: '' });
    const openRejectModal = (item, isWeekly = false) => {
        setRejectModal({ show: true, item, isWeekly, reason: '' });
    };
    const closeRejectModal = () => {
        setRejectModal({ show: false, item: null, isWeekly: false, reason: '' });
    };

    const [form, setForm] = useState({
        id_student: roleName === 'student' ? user.username || '' : '',
        leave_type: 'REGULAR_WEEKEND',
        leave_date: mockToday,
        start_time: '',
        end_time: '',
        reason: '',
    });

    // Đồng bộ leave_date khi mockToday load xong (async)
    useEffect(() => {
        if (mockToday) setForm(f => ({ ...f, leave_date: f.leave_date || mockToday }));
    }, [mockToday]);

    // Trạng thái phê duyệt của đơn đăng ký (parent row), không phải tuần hiện tại
    const getRegistrationStatus = (item) => {
        if (item.registration_status) return item.registration_status;
        const leaveType = item.leave_type;
        const teacher = item.teacher_accept || 'PENDING';
        const manager = item.manager_accept || 'PENDING';
        const dorm = item.dorm_manager_accept || 'PENDING';

        if (leaveType === 'AFTER_SCHOOL') {
            return dorm;
        }
        if (leaveType === 'EMERGENCY') {
            return manager;
        }
        if (teacher === 'DENIED' || manager === 'DENIED') return 'DENIED';
        if (teacher === 'ACCEPTED' && manager === 'ACCEPTED') return 'ACCEPTED';
        return 'PENDING';
    };

    const getTeacherApproval = (item) => (
        item.leave_type === 'REGULAR_WEEKEND'
            ? item.current_week_teacher_accept || 'PENDING'
            : item.teacher_accept || 'PENDING'
    );

    const getManagerApproval = (item) => (
        item.leave_type === 'REGULAR_WEEKEND'
            ? item.current_week_manager_accept || 'PENDING'
            : item.manager_accept || 'PENDING'
    );

    const getDormManagerApproval = (item) => (
        item.dorm_manager_accept || 'PENDING'
    );

    const getEffectiveStatus = (item) => {
        if (item.status) return item.status;
        const leaveType = item.leave_type;
        if (leaveType === 'AFTER_SCHOOL') {
            return getDormManagerApproval(item);
        }
        if (leaveType === 'EMERGENCY') {
            return getManagerApproval(item);
        }
        const teacher = getTeacherApproval(item);
        const manager = getManagerApproval(item);
        if (teacher === 'DENIED' || manager === 'DENIED') return 'DENIED';
        if (teacher === 'ACCEPTED' && manager === 'ACCEPTED') return 'ACCEPTED';
        return 'PENDING';
    };

    const getStatusSortPriority = (item) => {
        const status = getEffectiveStatus(item);
        return ({
            PENDING: 0,
            ACCEPTED: 1,
            DENIED: 2,
            OVERDUE: 3,
        }[status] ?? 99);
    };

    const isPast = (item) => {
        const endTime = item.leave_type === 'REGULAR_WEEKEND' ? item.current_week_end_time : item.end_time;
        if (!endTime) return false;
        return new Date(endTime.replace(' ', 'T')).getTime() < Date.now();
    };

    const getDefaultSortPriority = (item) => {
        const status = getEffectiveStatus(item);
        const past = isPast(item);
        if (status === 'PENDING' && !past) return 0; // Đang chờ và còn hiệu lực
        if (!past) return 1; // Khác (Đã duyệt/Từ chối) nhưng chưa qua hạn
        return 2; // Đã qua hạn hoặc quá hạn
    };

    const getEffectiveCreatedAt = (item) => {
        if (item.leave_type === 'REGULAR_WEEKEND' && item.current_week_start_time) {
            const d = new Date(item.current_week_start_time.replace(' ', 'T'));
            const day = d.getDay(); // 0 is Sunday, 1 is Monday
            const diff = day === 0 ? 6 : day - 1;
            d.setDate(d.getDate() - diff);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        }
        return new Date(item.created_at.replace(' ', 'T')).getTime();
    };

    const fetchRequests = () => {
        setLoading(true);
        fetch(`${API_LEAVE}/?username=${encodeURIComponent(user.username || '')}&role_name=${encodeURIComponent(roleName)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setRequests(data.data || []);
                    setSelectedIds([]);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const fetchStudents = () => {
        fetch(`${API_STUDENT}/`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setStudents(data.data || []);
            })
            .catch(console.error);
    };

    useEffect(() => {
        fetchRequests();
        if (isStaff) fetchStudents();
    }, []);

    const studentOptions = useMemo(
        () => [...students].sort(sortViName),
        [students]
    );

    // Class list extracted from students for the form picker
    const studentClassOptions = useMemo(
        () => [...new Set(students.map(s => s.class_name).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
        [students]
    );

    // Students filtered by class and search query for the form picker
    const filteredStudentOptions = useMemo(() => {
        const q = studentSearch.trim().toLowerCase();
        return studentOptions
            .filter(s => !studentClassFilter || s.class_name === studentClassFilter)
            .filter(s => !q || (s.name || '').toLowerCase().includes(q) || (s.id_VNeID || '').includes(q));
    }, [studentOptions, studentClassFilter, studentSearch]);

    const classOptions = useMemo(
        () => [...new Set(requests.map(item => item.class_name).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
        [requests]
    );

    const filteredRequests = useMemo(
        () => [...requests]
            .filter(item => !classFilter || item.class_name === classFilter)
            .filter(item => !typeFilter || item.leave_type === typeFilter)
            .filter(item => {
                if (!dateRange.start && !dateRange.end) return true;
                let timeStr = item.start_time;
                if (item.leave_type === 'REGULAR_WEEKEND' && item.current_week_start_time) {
                    timeStr = item.current_week_start_time;
                }
                const checkTime = timeStr || item.created_at;
                if (!checkTime) return true;
                const checkDate = checkTime.slice(0, 10);
                if (dateRange.start && checkDate < dateRange.start) return false;
                if (dateRange.end && checkDate > dateRange.end) return false;
                return true;
            })
            .sort((left, right) => {
                if (!sortConfig.key) {
                    // Mặc định (sortConfig.key === ''): Sắp xếp thông minh
                    const pL = getDefaultSortPriority(left);
                    const pR = getDefaultSortPriority(right);
                    if (pL !== pR) return pL - pR;
                    return getEffectiveCreatedAt(right) - getEffectiveCreatedAt(left);
                }

                let compareValue = 0;
                switch (sortConfig.key) {
                    case 'student_name':
                        compareValue = sortViName(left, right);
                        break;
                    case 'leave_type':
                        const typeL = typeLabel[left.leave_type] || left.leave_type;
                        const typeR = typeLabel[right.leave_type] || right.leave_type;
                        compareValue = typeL.localeCompare(typeR, 'vi');
                        break;
                    case 'created_at':
                        compareValue = getEffectiveCreatedAt(left) - getEffectiveCreatedAt(right);
                        break;
                    case 'leave_time':
                        const startL = (left.leave_type === 'REGULAR_WEEKEND' && left.current_week_start_time) ? left.current_week_start_time : left.start_time;
                        const startR = (right.leave_type === 'REGULAR_WEEKEND' && right.current_week_start_time) ? right.current_week_start_time : right.start_time;
                        const timeL = startL ? new Date(startL.replace(' ', 'T')).getTime() : 0;
                        const timeR = startR ? new Date(startR.replace(' ', 'T')).getTime() : 0;
                        compareValue = timeL - timeR;
                        break;
                    case 'status':
                        compareValue = getStatusSortPriority(left) - getStatusSortPriority(right);
                        if (compareValue === 0) compareValue = sortViName(left, right);
                        break;
                    default:
                        break;
                }
                return sortConfig.direction === 'asc' ? compareValue : -compareValue;
            }),
        [requests, classFilter, typeFilter, dateRange, sortConfig]
    );

    const toggleSort = (key) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const sortIcon = (key) => {
        if (sortConfig.key !== key) return '';
        return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    };

    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allVisibleSelected = filteredRequests.length > 0
        && filteredRequests.every(item => selectedIdSet.has(item.id));

    const setLeaveType = (leaveType) => {
        setForm(prev => ({
            ...prev,
            leave_type: leaveType,
            reason: leaveType === 'REGULAR_WEEKEND' ? '' : prev.reason,
        }));
    };

    const formatDate = (value) => {
        if (!value) return '';
        try {
            const d = new Date(value.replace(' ', 'T'));
            if (isNaN(d.getTime())) return value;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        } catch {
            return value;
        }
    };

    const formatDateTime = (value) => {
        if (!value) return '-';
        try {
            const d = new Date(value.replace(' ', 'T'));
            if (isNaN(d.getTime())) return value;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        } catch {
            return value;
        }
    };

    const formatDateRange = (item) => {
        let startStr = item.start_time;
        let endStr = item.end_time;
        if (item.leave_type === 'REGULAR_WEEKEND' && item.current_week_start_time && item.current_week_end_time) {
            startStr = item.current_week_start_time;
            endStr = item.current_week_end_time;
        }
        const start = formatDate(startStr);
        const end = formatDate(endStr);
        return start === end ? start : `${start} - ${end}`;
    };

    const submitLeave = (e) => {
        e.preventDefault();
        setMessage(null);
        let checkDate = form.leave_date;
        if (form.leave_type === 'EMERGENCY' && form.start_time) {
            checkDate = form.start_time.split('T')[0];
        }
        if (checkDate && mockToday && checkDate < mockToday) {
            setMessage({ success: false, text: 'Không thể tạo đơn nghỉ phép trước hôm nay.' });
            return;
        }
        fetch(`${API_LEAVE}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, created_by: user.username, created_by_role: roleName }),
        })
            .then(res => res.json())
            .then(data => {
                setMessage({ success: data.success, text: data.message || data.error });
                if (data.success) {
                    fetchRequests();
                    setShowForm(false);
                }
            })
            .catch(() => setMessage({ success: false, text: 'Lỗi kết nối server' }));
    };

    const updateStatus = (id, status, decisionNote = null) => {
        fetch(`${API_LEAVE}/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                username: user.username,
                role_name: roleName,
                decision_note: decisionNote,
                reason: decisionNote
            }),
        })
            .then(res => res.json())
            .then(data => {
                setMessage({ success: data.success, text: data.message || data.error });
                if (data.success) fetchRequests();
            });
    };

    const updateCurrentWeekStatus = (id, status, decisionNote = null) => {
        fetch(`${API_LEAVE}/${id}/current-week-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                username: user.username,
                role_name: roleName,
                decision_note: decisionNote,
                reason: decisionNote
            }),
        })
            .then(res => res.json())
            .then(data => {
                setMessage({ success: data.success, text: data.message || data.error });
                if (data.success) fetchRequests();
            });
    };

    const submitReject = (e) => {
        if (e) e.preventDefault();
        const reason = (rejectModal.reason || '').trim();
        if (!reason) {
            alert('Vui lòng nhập lý do từ chối đơn nghỉ phép!');
            return;
        }
        const item = rejectModal.item;
        const isWeekly = rejectModal.isWeekly;
        closeRejectModal();
        if (isWeekly) {
            updateCurrentWeekStatus(item.id, 'DENIED', reason);
        } else {
            updateStatus(item.id, 'DENIED', reason);
        }
    };

    const deleteLeave = (item) => {
        showConfirm('Xoá đơn nghỉ phép', 'Bạn có muốn xoá mềm đơn nghỉ phép này không?', () => {
            closeConfirm();
            fetch(`${API_LEAVE}/${item.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.username, role_name: roleName }),
            })
                .then(res => res.json())
                .then(data => {
                    setMessage({ success: data.success, text: data.message || data.error });
                    if (data.success) fetchRequests();
                });
        }, 'danger');
    };

    const deleteSelected = () => {
        if (!selectedIds.length) return;
        showConfirm('Xoá hàng loạt', `Bạn có muốn xoá mềm ${selectedIds.length} đơn đã chọn không?`, () => {
            closeConfirm();
            fetch(`${API_LEAVE}/bulk-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds, username: user.username, role_name: roleName }),
            })
                .then(res => res.json())
                .then(data => {
                    setMessage({ success: data.success, text: data.message || data.error });
                    if (data.success) {
                        setSelectedIds([]);
                        fetchRequests();
                    }
                });
        }, 'danger');
    };

    const confirmIfChanged = (currentApproval, nextStatus, callback) => {
        if (currentApproval === 'PENDING') { callback(); return; }
        showConfirm('Đổi trạng thái', `Bạn đã thao tác "${statusLabel[currentApproval]}" trước đó. Bạn có muốn đổi sang "${statusLabel[nextStatus]}" không?`, () => { closeConfirm(); callback(); });
    };

    const handleStaffStatus = (item, nextStatus) => {
        if (nextStatus === 'DENIED') {
            const isWeekly = (item.leave_type === 'REGULAR_WEEKEND' && getRegistrationStatus(item) === 'ACCEPTED');
            openRejectModal(item, isWeekly);
            return;
        }

        if (item.leave_type === 'AFTER_SCHOOL') {
            const currentApproval = item.dorm_manager_accept || 'PENDING';
            confirmIfChanged(currentApproval, nextStatus, () => updateStatus(item.id, nextStatus));
        } else if (item.leave_type === 'EMERGENCY') {
            const currentApproval = item.manager_accept || 'PENDING';
            confirmIfChanged(currentApproval, nextStatus, () => updateStatus(item.id, nextStatus));
        } else if (item.leave_type === 'REGULAR_WEEKEND') {
            const regStatus = getRegistrationStatus(item);
            if (regStatus !== 'ACCEPTED') {
                const col = roleName === 'teacher' ? (item.teacher_accept || 'PENDING') : (item.manager_accept || 'PENDING');
                confirmIfChanged(col, nextStatus, () => updateStatus(item.id, nextStatus));
            } else {
                const weekCol = roleName === 'teacher' ? (item.current_week_teacher_accept || 'PENDING') : (item.current_week_manager_accept || 'PENDING');
                confirmIfChanged(weekCol, nextStatus, () => updateCurrentWeekStatus(item.id, nextStatus));
            }
        }
    };

    const renderBadge = (value) => (
        <span className={`badge ${statusClass[value] || 'bg-secondary'}`}>{statusLabel[value] || value}</span>
    );

    const renderStaffButtons = (item) => {
        const effectiveStatus = getEffectiveStatus(item);
        const registrationStatus = getRegistrationStatus(item);
        if (
            effectiveStatus === 'OVERDUE'
            || registrationStatus === 'OVERDUE'
            || item.current_week_status === 'OVERDUE'
        ) {
            return <span className="text-muted small">Đơn đã quá hạn</span>;
        }

        let startStr = item.start_time;
        if (item.leave_type === 'REGULAR_WEEKEND') {
            const regStatus = getRegistrationStatus(item);
            if (regStatus === 'ACCEPTED' && item.current_week_start_time) {
                startStr = item.current_week_start_time;
            }
        }

        if (startStr && new Date(startStr.replace(' ', 'T')).getTime() < Date.now()) {
            return <span className="text-muted small"></span>;
        }

        // 1. ĐƠN RA NGOÀI: Quản lý KTX duyệt
        if (item.leave_type === 'AFTER_SCHOOL') {
            if (roleName !== 'dorm_manager' && roleName !== 'manager') {
                return <span className="text-muted small">Chờ QL KTX xử lý</span>;
            }
            const currentApproval = item.dorm_manager_accept || 'PENDING';
            return (
                <div className="d-flex gap-2 flex-wrap">
                    {currentApproval !== 'ACCEPTED' && (
                        <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'ACCEPTED'); }}>
                            Duyệt đơn
                        </button>
                    )}
                    {currentApproval !== 'DENIED' && (
                        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'DENIED'); }}>
                            Từ chối
                        </button>
                    )}
                    <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); deleteLeave(item); }}>Xoá</button>
                </div>
            );
        }

        // 2. ĐƠN ĐỘT XUẤT: BGH duyệt trực tiếp
        if (item.leave_type === 'EMERGENCY') {
            if (roleName !== 'manager') {
                return <span className="text-muted small">Chờ BGH xử lý</span>;
            }
            const currentApproval = item.manager_accept || 'PENDING';
            return (
                <div className="d-flex gap-2 flex-wrap">
                    {currentApproval !== 'ACCEPTED' && (
                        <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'ACCEPTED'); }}>
                            BGH Duyệt
                        </button>
                    )}
                    {currentApproval !== 'DENIED' && (
                        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'DENIED'); }}>
                            Từ chối
                        </button>
                    )}
                    <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); deleteLeave(item); }}>Xoá</button>
                </div>
            );
        }

        // 3. ĐƠN CUỐI TUẦN: GVCN duyệt cấp 1 -> BGH duyệt cấp 2
        if (item.leave_type === 'REGULAR_WEEKEND') {
            if (roleName !== 'teacher' && roleName !== 'manager') {
                return <span className="text-muted small">Chờ GVCN/BGH xử lý</span>;
            }
            const regStatus = getRegistrationStatus(item);
            if (regStatus !== 'ACCEPTED') {
                const myApproval = roleName === 'teacher' ? (item.teacher_accept || 'PENDING') : (item.manager_accept || 'PENDING');
                return (
                    <div className="d-flex gap-2 flex-wrap">
                        {myApproval !== 'ACCEPTED' && (
                            <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'ACCEPTED'); }}>
                                {roleName === 'teacher' ? 'GVCN Duyệt' : 'BGH Duyệt'}
                            </button>
                        )}
                        {myApproval !== 'DENIED' && (
                            <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'DENIED'); }}>
                                Từ chối
                            </button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); deleteLeave(item); }}>Xoá</button>
                    </div>
                );
            } else {
                const weekMyApproval = roleName === 'teacher' ? (item.current_week_teacher_accept || 'PENDING') : (item.current_week_manager_accept || 'PENDING');
                return (
                    <div className="d-flex gap-2 flex-wrap">
                        {weekMyApproval !== 'ACCEPTED' && (
                            <button className="btn btn-sm btn-outline-success" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'ACCEPTED'); }}>
                                Cho phép tuần này
                            </button>
                        )}
                        {weekMyApproval !== 'DENIED' && (
                            <button className="btn btn-sm btn-outline-warning" onClick={(e) => { e.stopPropagation(); handleStaffStatus(item, 'DENIED'); }}>
                                Cấm tuần này
                            </button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); deleteLeave(item); }}>Xoá</button>
                    </div>
                );
            }
        }
        return null;
    };

    const toggleSelected = (id) => {
        setSelectedIds(prev => (
            prev.includes(id)
                ? prev.filter(itemId => itemId !== id)
                : [...prev, id]
        ));
    };

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            const visibleIds = new Set(filteredRequests.map(item => item.id));
            setSelectedIds(prev => prev.filter(id => !visibleIds.has(id)));
        } else {
            const merged = new Set(selectedIds);
            filteredRequests.forEach(item => merged.add(item.id));
            setSelectedIds([...merged]);
        }
    };

    const openDetail = (item) => {
        setDetailItem(item);
    };

    const closeDetail = () => {
        setDetailItem(null);
    };

    const selectedCount = selectedIds.length;

    return (
        <div style={{ padding: '20px' }}>
            <style>{`
                @media (max-width: 768px) {
                    .leave-col-hide { display: none !important; }
                    .leave-filter-bar { flex-direction: column !important; align-items: stretch !important; }
                    .leave-filter-bar .form-select { max-width: 100% !important; }
                }
            `}</style>
            <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <h2 style={{ color: '#00206d', marginBottom: 0, fontWeight: 700 }}>Quản lý nghỉ phép</h2>
                <div className="d-flex gap-2">
                    <button
                        className="btn btn-outline-success"
                        onClick={() => {
                            const params = new URLSearchParams({
                                username: user.username || '',
                                role_name: roleName
                            });
                            window.location.href = `${API_LEAVE}/export?${params.toString()}`;
                        }}
                        title="Xuất danh sách đơn nghỉ phép ra Excel"
                    >
                        <i className="fas fa-file-excel me-1"></i> Xuất Excel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setMessage(null); setShowForm(true); }}
                    >
                        <i className="fas fa-plus me-1"></i> Tạo phiếu nghỉ phép
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowForm(false)}>
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Tạo phiếu nghỉ phép</h5>
                                <button type="button" className="btn-close" onClick={() => setShowForm(false)} />
                            </div>
                            <div className="modal-body">
                                {message && <div className={`alert ${message.success ? 'alert-success' : 'alert-danger'}`}>{message.text}</div>}
                                <div className="d-flex gap-2 flex-wrap mb-3">
                                    {Object.entries(typeLabel).map(([type, label]) => (
                                        <button
                                            key={type}
                                            type="button"
                                            className={`btn btn-sm ${form.leave_type === type ? 'btn-primary' : 'btn-outline-primary'}`}
                                            onClick={() => setLeaveType(type)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <form id="leave-create-form" onSubmit={submitLeave}>
                                    <div className="row g-3">
                                        {isStaff && (
                                            <div className="col-12">
                                                <label className="form-label fw-semibold">Học sinh</label>
                                                <div>
                                                    {/* Filter bar */}
                                                    <div className="d-flex gap-2 mb-2">
                                                        <select
                                                            className="form-select form-select-sm"
                                                            style={{ maxWidth: '150px', flexShrink: 0 }}
                                                            value={studentClassFilter}
                                                            onChange={(e) => { setStudentClassFilter(e.target.value); setForm(f => ({ ...f, id_student: '' })); }}
                                                        >
                                                            <option value="">Tất cả lớp</option>
                                                            {studentClassOptions.map(cls => (
                                                                <option key={cls} value={cls}>{cls}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            className="form-control form-control-sm"
                                                            placeholder="Tìm tên, CCCD..."
                                                            value={studentSearch}
                                                            onChange={(e) => { setStudentSearch(e.target.value); setForm(f => ({ ...f, id_student: '' })); }}
                                                        />
                                                    </div>
                                                    {/* Selected badge */}
                                                    {form.id_student && (() => {
                                                        const sel = students.find(s => s.id_VNeID === form.id_student);
                                                        return sel ? (
                                                            <div className="alert alert-primary py-1 px-2 mb-2 d-flex align-items-center justify-content-between" style={{ fontSize: '0.85rem' }}>
                                                                <span>✓ Đã chọn: <strong>{sel.name}</strong>{sel.class_name ? ` — Lớp ${sel.class_name}` : ''}</span>
                                                                <button type="button" className="btn-close btn-close-sm ms-2" style={{ fontSize: '0.6rem' }} onClick={() => setForm(f => ({ ...f, id_student: '' }))} />
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                    {/* Student list */}
                                                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '6px' }}>
                                                        {filteredStudentOptions.length === 0 ? (
                                                            <div className="text-center text-muted py-3" style={{ fontSize: '0.85rem' }}>Không tìm thấy học sinh</div>
                                                        ) : (
                                                            filteredStudentOptions.map(student => {
                                                                const isSelected = form.id_student === student.id_VNeID;
                                                                const parts = (student.name || '').trim().split(' ');
                                                                const ten = parts[parts.length - 1];
                                                                const hoTenDem = parts.slice(0, -1).join(' ');
                                                                return (
                                                                    <div
                                                                        key={student.id_VNeID}
                                                                        onClick={() => setForm(f => ({ ...f, id_student: isSelected ? '' : student.id_VNeID }))}
                                                                        style={{
                                                                            padding: '7px 12px',
                                                                            cursor: 'pointer',
                                                                            borderBottom: '1px solid #f0f0f0',
                                                                            background: isSelected ? '#e8f0fe' : 'transparent',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '10px',
                                                                        }}
                                                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8f9fa'; }}
                                                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                width: 32, height: 32, borderRadius: '50%',
                                                                                background: isSelected ? '#4285f4' : '#6c757d',
                                                                                color: '#fff',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                                                                            }}
                                                                        >
                                                                            {ten ? ten[0].toUpperCase() : '?'}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                <span style={{ color: '#888', fontWeight: 400 }}>{hoTenDem} </span>
                                                                                <span>{ten}</span>
                                                                            </div>
                                                                            <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                                                                {student.class_name ? <span className="me-2">Lớp {student.class_name}</span> : null}
                                                                                <span>{student.id_VNeID}</span>
                                                                            </div>
                                                                        </div>
                                                                        {isSelected && <span style={{ color: '#4285f4', fontSize: '1rem' }}>✓</span>}
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                    {/* Hidden required input to trigger form validation */}
                                                    <input type="hidden" value={form.id_student} required />
                                                    {!form.id_student && <div className="text-danger mt-1" style={{ fontSize: '0.78rem' }}>Vui lòng chọn học sinh</div>}
                                                </div>
                                            </div>
                                        )}
                                        {form.leave_type === 'REGULAR_WEEKEND' && (
                                            <div className="col-md-6">
                                                <label className="form-label">Ngày bắt đầu đăng ký</label>
                                                <input
                                                    type="date"
                                                    lang="en-GB"
                                                    className="form-control"
                                                    value={form.leave_date}
                                                    onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
                                                />
                                            </div>
                                        )}
                                        {form.leave_type === 'AFTER_SCHOOL' && (
                                            <div className="col-md-6">
                                                <label className="form-label">Ngày ra ngoài</label>
                                                <input
                                                    type="date"
                                                    lang="en-GB"
                                                    className="form-control"
                                                    value={form.leave_date}
                                                    onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
                                                />
                                            </div>
                                        )}
                                        {form.leave_type === 'EMERGENCY' && (
                                            <>
                                                <div className="col-md-6">
                                                    <label className="form-label">Bắt đầu</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="form-control"
                                                        value={form.start_time}
                                                        onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label">Kết thúc</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="form-control"
                                                        value={form.end_time}
                                                        onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {form.leave_type !== 'REGULAR_WEEKEND' && (
                                            <div className="col-12">
                                                <label className="form-label">Lý do</label>
                                                <input
                                                    className="form-control"
                                                    value={form.reason}
                                                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                                    placeholder="Nhập lý do nghỉ phép..."
                                                />
                                            </div>
                                        )}
                                    </div>
                                </form>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                                <button type="submit" form="leave-create-form" className="btn btn-primary">Tạo phiếu</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded p-4 shadow-sm">
                <div className="leave-filter-bar d-flex gap-2 flex-wrap mb-3 align-items-center justify-content-between">
                    <div className="d-flex gap-2 flex-wrap">
                        {isStaff && (
                            <select
                                className="form-select"
                                style={{ maxWidth: '220px' }}
                                value={classFilter}
                                onChange={(e) => setClassFilter(e.target.value)}
                            >
                                <option value="">Tất cả lớp</option>
                                {classOptions.map(className => (
                                    <option key={className} value={className}>Lớp {className}</option>
                                ))}
                            </select>
                        )}
                        <select
                            className="form-select"
                            style={{ maxWidth: '260px' }}
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="">Tất cả loại nghỉ phép</option>
                            {Object.entries(typeLabel).map(([type, label]) => (
                                <option key={type} value={type}>{label}</option>
                            ))}
                        </select>
                        <DateRangePicker
                            startDate={dateRange.start}
                            endDate={dateRange.end}
                            onChange={(s, e) => setDateRange({ start: s, end: e })}
                            placeholder="Lọc theo khoảng ngày"
                        />
                    </div>
                    {selectedCount > 0 && (
                        <button className="btn btn-danger" type="button" onClick={deleteSelected}>
                            Xóa hàng loạt ({selectedCount})
                        </button>
                    )}
                </div>
                <div className="table-responsive-x">
                    <table className="table table-hover align-middle" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '36px' }}>
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('student_name')}>
                                    Học sinh{sortIcon('student_name')}
                                </th>
                                <th className="leave-col-hide" style={{ cursor: 'pointer' }} onClick={() => toggleSort('leave_type')}>
                                    Loại{sortIcon('leave_type')}
                                </th>
                                <th className="leave-col-hide" style={{ cursor: 'pointer' }} onClick={() => toggleSort('created_at')}>
                                    Ngày tạo{sortIcon('created_at')}
                                </th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('leave_time')}>
                                    Thời gian nghỉ phép{sortIcon('leave_time')}
                                </th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('status')}>
                                    Trạng thái{sortIcon('status')}
                                </th>
                                <th className="leave-col-hide">Lý do</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="text-center">Đang tải dữ liệu...</td>
                                </tr>
                            ) : filteredRequests.map(item => (
                                <tr
                                    key={item.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => openDetail(item)}
                                >
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIdSet.has(item.id)}
                                            onChange={() => toggleSelected(item.id)}
                                        />
                                    </td>
                                    <td>
                                        {item.student_name || item.id_student}
                                        <div className="small text-muted">{item.class_name || '-'}</div>
                                    </td>
                                    <td className="leave-col-hide">{typeLabel[item.leave_type] || item.leave_type}</td>
                                    <td className="leave-col-hide">{formatDateTime(item.created_at)}</td>
                                    <td>{formatDateRange(item)}</td>
                                    <td>
                                        {item.leave_type === 'AFTER_SCHOOL' ? (() => {
                                            const d = item.dorm_manager_accept || 'PENDING';
                                            const eff = getEffectiveStatus(item);
                                            if (eff === 'OVERDUE') return renderBadge('OVERDUE');
                                            return (
                                                <span className={`badge ${statusClass[d] || 'bg-secondary'}`}>
                                                    {d === 'ACCEPTED' ? 'Đã duyệt' : d === 'DENIED' ? 'Từ chối' : 'Chờ QL KTX duyệt'}
                                                </span>
                                            );
                                        })() : item.leave_type === 'EMERGENCY' ? (() => {
                                            const m = item.manager_accept || 'PENDING';
                                            const eff = getEffectiveStatus(item);
                                            if (eff === 'OVERDUE') return renderBadge('OVERDUE');
                                            return (
                                                <span className={`badge ${statusClass[m] || 'bg-secondary'}`}>
                                                    {m === 'ACCEPTED' ? 'Đã duyệt' : m === 'DENIED' ? 'Từ chối' : 'Chờ BGH duyệt'}
                                                </span>
                                            );
                                        })() : item.leave_type === 'REGULAR_WEEKEND' ? (() => {
                                            const regStatus = getRegistrationStatus(item);
                                            if (regStatus !== 'ACCEPTED') {
                                                const t = item.teacher_accept || 'PENDING';
                                                const m = item.manager_accept || 'PENDING';
                                                let label = 'Chờ GVCN duyệt (C1)';
                                                if (t === 'DENIED' || m === 'DENIED') label = 'Bị từ chối';
                                                else if (t === 'ACCEPTED') label = 'Chờ BGH duyệt (C2)';
                                                return regStatus === 'OVERDUE'
                                                    ? renderBadge(regStatus)
                                                    : <span className={`badge ${statusClass[regStatus] || 'bg-secondary'}`}>{label}</span>;
                                            }
                                            return (
                                                <>
                                                    <span className="badge bg-success me-1">Có hiệu lực</span>
                                                    <span className={`badge ${statusClass[item.current_week_status] || 'bg-secondary'}`} style={{ fontSize: '0.72em' }}>{item.weekly_status_text}</span>
                                                </>
                                            );
                                        })() : renderBadge(getEffectiveStatus(item))}
                                    </td>
                                    <td className="leave-col-hide">{item.leave_type === 'REGULAR_WEEKEND' ? '-' : (item.reason || '-')}</td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        {isStaff
                                            ? renderStaffButtons(item)
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="text-center">Chưa có đơn nghỉ phép</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {detailItem && (
                <div className="modal d-block" tabIndex="-1" role="dialog" onClick={closeDetail} style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Chi tiết đơn nghỉ phép</h5>
                                <button type="button" className="btn-close" onClick={closeDetail} />
                            </div>
                            <div className="modal-body">
                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <div className="small text-muted">Học sinh</div>
                                        <div>{detailItem.student_name || detailItem.id_student}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Lớp</div>
                                        <div>{detailItem.class_name || '-'}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Loại nghỉ phép</div>
                                        <div>{typeLabel[detailItem.leave_type] || detailItem.leave_type}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Trạng thái tổng</div>
                                        <div>{renderBadge(getEffectiveStatus(detailItem))}</div>
                                    </div>
                                    {detailItem.leave_type === 'AFTER_SCHOOL' && (
                                        <div className="col-md-6">
                                            <div className="small text-muted">Quản lý KTX duyệt</div>
                                            <div>{renderBadge(getDormManagerApproval(detailItem))}</div>
                                        </div>
                                    )}
                                    {detailItem.leave_type === 'EMERGENCY' && (
                                        <div className="col-md-6">
                                            <div className="small text-muted">Ban Giám Hiệu duyệt</div>
                                            <div>{renderBadge(getManagerApproval(detailItem))}</div>
                                        </div>
                                    )}
                                    {detailItem.leave_type === 'REGULAR_WEEKEND' && (
                                        <>
                                            <div className="col-md-6">
                                                <div className="small text-muted">Cấp 1: GVCN duyệt</div>
                                                <div>{renderBadge(getTeacherApproval(detailItem))}</div>
                                            </div>
                                            <div className="col-md-6">
                                                <div className="small text-muted">Cấp 2: BGH duyệt</div>
                                                <div>{renderBadge(getManagerApproval(detailItem))}</div>
                                            </div>
                                        </>
                                    )}
                                    <div className="col-md-12">
                                        <div className="small text-muted">Thời gian</div>
                                        <div>{formatDateRange(detailItem)}</div>
                                    </div>
                                    <div className="col-md-12">
                                        <div className="small text-muted">Lý do</div>
                                        <div>{detailItem.leave_type === 'REGULAR_WEEKEND' ? '-' : (detailItem.reason || '-')}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Người tạo</div>
                                        <div>{detailItem.created_by_name || detailItem.created_by || '-'}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Vai trò người tạo</div>
                                        <div>{detailItem.created_by_role || '-'}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Ngày tạo</div>
                                        <div>{formatDateTime(detailItem.created_at)}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Người duyệt gần nhất</div>
                                        <div>{detailItem.decided_by_name || detailItem.decided_by || '-'}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted">Thời điểm duyệt</div>
                                        <div>{formatDateTime(detailItem.decided_at)}</div>
                                    </div>
                                    <div className="col-md-12">
                                        <div className="small text-muted">Ghi chú duyệt</div>
                                        <div>{detailItem.decision_note || '-'}</div>
                                    </div>
                                    {detailItem.leave_type === 'REGULAR_WEEKEND' && (
                                        <div className="col-md-12">
                                            <div className="small text-muted">Trạng thái tuần hiện tại</div>
                                            <div>
                                                <span className={`badge ${statusClass[detailItem.current_week_status] || 'bg-secondary'}`}>
                                                    {detailItem.weekly_status_text || statusLabel[detailItem.current_week_status] || 'Chờ duyệt'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeDetail}>Đóng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Leave Request Modal (UC12 & Alternative Flow 12b) */}
            {rejectModal.show && rejectModal.item && (
                <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeRejectModal}>
                    <div className="modal-dialog modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-content">
                            <div className="modal-header bg-danger text-white">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-times-circle me-2"></i>
                                    Từ chối đơn xin nghỉ phép
                                </h5>
                                <button type="button" className="btn-close btn-close-white" onClick={closeRejectModal} />
                            </div>
                            <div className="modal-body">
                                <div className="alert alert-light border mb-3">
                                    <div><strong>Học sinh:</strong> {rejectModal.item.student_name || rejectModal.item.id_student} ({rejectModal.item.class_name || 'Lớp -'})</div>
                                    <div><strong>Loại đơn:</strong> {typeLabel[rejectModal.item.leave_type] || rejectModal.item.leave_type}</div>
                                    <div><strong>Thời gian:</strong> {formatDateRange(rejectModal.item)}</div>
                                </div>

                                <label className="form-label fw-bold">
                                    Chọn nhanh lý do từ chối mẫu (Luồng 12b):
                                </label>
                                <div className="d-flex flex-wrap gap-1 mb-3">
                                    {QUICK_REJECT_REASONS.map((reasonText, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary text-start"
                                            style={{ fontSize: '0.8rem' }}
                                            onClick={() => setRejectModal(prev => ({ ...prev, reason: reasonText }))}
                                        >
                                            • {reasonText}
                                        </button>
                                    ))}
                                </div>

                                <div className="mb-2">
                                    <label className="form-label fw-bold">
                                        Lý do từ chối <span className="text-danger">* (Bắt buộc)</span>:
                                    </label>
                                    <textarea
                                        className="form-control"
                                        rows="3"
                                        placeholder="Nhập lý do từ chối cụ thể để thông báo cho học sinh..."
                                        value={rejectModal.reason}
                                        onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-text text-muted" style={{ fontSize: '0.8rem' }}>
                                    Lưu ý: Khi từ chối, suất ăn của học sinh được bảo lưu 100% không bị cắt.
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeRejectModal}>
                                    Hủy bỏ
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    disabled={!rejectModal.reason.trim()}
                                    onClick={submitReject}
                                >
                                    <i className="fas fa-ban me-1"></i>
                                    Xác nhận từ chối
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            <ConfirmModal
                show={confirmModal.show}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirm}
                type={confirmModal.type}
            />
        </div>
    );
};

export default LeaveManager;
