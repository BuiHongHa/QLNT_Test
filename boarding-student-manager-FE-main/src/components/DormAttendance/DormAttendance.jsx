import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import { useMockToday } from '../../hooks/useMockToday';
import ConfirmModal from '../common/ConfirmModal';

const API_ATT = apiUrl('/api/dorm-attendance');
const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };

const DormAttendance = () => {
    const user = getStoredUser() || {};
    const roleName = user.role_name || roleMap[user.role_id] || '';
    const isTeacher = roleName === 'teacher';
    const mockToday = useMockToday();

    const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'summary'
    const [attDate, setAttDate] = useState('');
    const [buildingFilter, setBuildingFilter] = useState('');
    const [rooms, setRooms] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [roomDetail, setRoomDetail] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    // Summary tab state
    const [summaryData, setSummaryData] = useState({
        total_boarding: 0,
        stats: { PRESENT: 0, ABSENT_LEAVE: 0, ABSENT_UNEXCUSED: 0 },
        absent_students: []
    });
    const [loadingSummary, setLoadingSummary] = useState(false);

    // Modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

    const showAlert = (title, message, type = 'info') => setAlertModal({ show: true, title, message, type });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));

    // Sync attDate with mockToday
    useEffect(() => {
        if (mockToday && !attDate) {
            setAttDate(mockToday);
        }
    }, [mockToday, attDate]);

    // Format date string helpers
    const changeDate = (days) => {
        if (!attDate) return;
        const current = new Date(attDate);
        current.setDate(current.getDate() + days);
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        setAttDate(`${y}-${m}-${d}`);
    };

    const fetchRooms = useCallback(() => {
        if (!attDate) return;
        setLoadingRooms(true);
        const params = new URLSearchParams({
            date: attDate,
            role_name: roleName,
            username: user.username || ''
        });
        fetch(`${API_ATT}/rooms?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setRooms(data.data || []);
                    if (!selectedRoomId && data.data && data.data.length > 0) {
                        setSelectedRoomId(data.data[0].id);
                    }
                } else {
                    showAlert('Lỗi', data.error || 'Không thể tải danh sách phòng', 'danger');
                }
                setLoadingRooms(false);
            })
            .catch(() => {
                setLoadingRooms(false);
                showAlert('Lỗi', 'Lỗi kết nối máy chủ', 'danger');
            });
    }, [attDate, roleName, user.username, selectedRoomId]);

    const fetchRoomDetail = useCallback((roomId) => {
        if (!roomId || !attDate) return;
        setLoadingDetail(true);
        fetch(`${API_ATT}/room/${roomId}?date=${attDate}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setRoomDetail(data.room);
                    setStudents(data.students || []);
                } else {
                    showAlert('Lỗi', data.error || 'Không thể tải chi tiết phòng', 'danger');
                }
                setLoadingDetail(false);
            })
            .catch(() => {
                setLoadingDetail(false);
                showAlert('Lỗi', 'Lỗi kết nối máy chủ', 'danger');
            });
    }, [attDate]);

    const fetchSummary = useCallback(() => {
        if (!attDate) return;
        setLoadingSummary(true);
        const params = new URLSearchParams({
            date: attDate,
            role_name: roleName,
            username: user.username || ''
        });
        fetch(`${API_ATT}/summary?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setSummaryData(data);
                }
                setLoadingSummary(false);
            })
            .catch(() => setLoadingSummary(false));
    }, [attDate, roleName, user.username]);

    useEffect(() => {
        if (attDate) {
            fetchRooms();
            if (activeTab === 'summary') {
                fetchSummary();
            }
        }
    }, [attDate, fetchRooms, activeTab, fetchSummary]);

    useEffect(() => {
        if (selectedRoomId && attDate) {
            fetchRoomDetail(selectedRoomId);
        }
    }, [selectedRoomId, attDate, fetchRoomDetail]);

    // Tách toà nhà từ tên phòng
    const buildingOptions = useMemo(() => {
        const set = new Set();
        rooms.forEach(r => {
            const m = (r.name || '').match(/^[^\d]+/);
            if (m) set.add(m[0].trim().toUpperCase());
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    }, [rooms]);

    const filteredRooms = useMemo(() => {
        if (!buildingFilter) return rooms;
        return rooms.filter(r => (r.name || '').toUpperCase().startsWith(buildingFilter));
    }, [rooms, buildingFilter]);

    // Cập nhật trạng thái từng học sinh
    const handleStudentStatusChange = (studentId, status) => {
        setStudents(prev => prev.map(s => {
            if (s.id_student === studentId) {
                return { ...s, status };
            }
            return s;
        }));
    };

    const handleStudentNoteChange = (studentId, note) => {
        setStudents(prev => prev.map(s => {
            if (s.id_student === studentId) {
                return { ...s, note };
            }
            return s;
        }));
    };

    // Đánh dấu cả phòng có mặt
    const handleMarkAllPresent = () => {
        setStudents(prev => prev.map(s => {
            // Nếu có đơn nghỉ phép đã duyệt thì giữ lại, còn lại chuyển sang PRESENT
            if (s.has_approved_leave) return s;
            return { ...s, status: 'PRESENT' };
        }));
    };

    // Lưu điểm danh
    const handleSaveAttendance = () => {
        if (!selectedRoomId || students.length === 0) return;
        setSaving(true);
        const payload = {
            date: attDate,
            id_dormroom: selectedRoomId,
            recorded_by: user.username || 'manager',
            records: students.map(s => ({
                id_student: s.id_student,
                status: s.status,
                note: s.note
            }))
        };

        fetch(`${API_ATT}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                setSaving(false);
                if (data.success) {
                    showAlert('Thành công', data.message || 'Lưu điểm danh thành công!', 'success');
                    fetchRooms();
                    fetchRoomDetail(selectedRoomId);
                } else {
                    showAlert('Lỗi', data.error || 'Không thể lưu điểm danh', 'danger');
                }
            })
            .catch(() => {
                setSaving(false);
                showAlert('Lỗi', 'Lỗi kết nối máy chủ khi lưu', 'danger');
            });
    };

    // Xuất Excel
    const handleExportExcel = () => {
        const params = new URLSearchParams({
            date: attDate,
            role_name: roleName,
            username: user.username || ''
        });
        window.location.href = `${API_ATT}/export?${params.toString()}`;
    };

    return (
        <div style={{ padding: '20px' }}>
            {/* Thanh tiêu đề & Tabs */}
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <div className="d-flex align-items-center gap-3">
                    <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>
                        <i className="fas fa-user-check me-2"></i>Điểm danh phòng ở KTX
                    </h2>
                    <div className="btn-group">
                        <button
                            className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setActiveTab('attendance')}
                        >
                            <i className="fas fa-clipboard-list me-1"></i>Điểm danh theo phòng
                        </button>
                        <button
                            className={`btn ${activeTab === 'summary' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setActiveTab('summary')}
                        >
                            <i className="fas fa-chart-pie me-1"></i>Báo cáo & Vắng mặt
                        </button>
                    </div>
                </div>

                {/* Bộ chọn ngày */}
                <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold small text-muted">Ngày:</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => changeDate(-1)} title="Ngày trước">
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <input
                        type="date"
                        className="form-control form-control-sm"
                        style={{ width: '150px', fontWeight: 600 }}
                        value={attDate}
                        onChange={(e) => setAttDate(e.target.value)}
                    />
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => changeDate(1)} title="Ngày sau">
                        <i className="fas fa-chevron-right"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => setAttDate(mockToday || new Date().toISOString().slice(0, 10))}>
                        Hôm nay
                    </button>
                    <button className="btn btn-sm btn-outline-success ms-2" onClick={handleExportExcel} title="Xuất báo cáo điểm danh ra file Excel">
                        <i className="fas fa-file-excel me-1"></i>Xuất Excel
                    </button>
                </div>
            </div>

            {/* TAB 1: ĐIỂM DANH THEO PHÒNG */}
            {activeTab === 'attendance' && (
                <div className="row g-3">
                    {/* Cột trái: Danh sách phòng */}
                    <div className="col-lg-4 col-md-5">
                        <div className="card shadow-sm border-0" style={{ borderRadius: '10px' }}>
                            <div className="card-header bg-white py-3 border-0">
                                <div className="d-flex justify-content-between align-items-center">
                                    <h6 className="fw-bold mb-0 text-primary">
                                        <i className="fas fa-door-open me-2"></i>Danh sách phòng ({filteredRooms.length})
                                    </h6>
                                    {buildingOptions.length > 0 && (
                                        <select
                                            className="form-select form-select-sm"
                                            style={{ width: '130px' }}
                                            value={buildingFilter}
                                            onChange={(e) => setBuildingFilter(e.target.value)}
                                        >
                                            <option value="">Tất cả toà</option>
                                            {buildingOptions.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                            <div className="card-body p-2" style={{ maxHeight: '680px', overflowY: 'auto' }}>
                                {loadingRooms ? (
                                    <div className="p-4 text-center text-muted">
                                        <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                                        Đang tải danh sách phòng...
                                    </div>
                                ) : filteredRooms.length === 0 ? (
                                    <div className="p-4 text-center text-muted">Không tìm thấy phòng phù hợp</div>
                                ) : (
                                    <div className="d-flex flex-column gap-2">
                                        {filteredRooms.map(room => {
                                            const isSelected = room.id === selectedRoomId;
                                            const hasUnexcused = (room.unexcused_count || 0) > 0;
                                            const hasLeave = (room.leave_count || 0) > 0;
                                            const isDone = room.is_checked;

                                            return (
                                                <div
                                                    key={room.id}
                                                    onClick={() => setSelectedRoomId(room.id)}
                                                    className={`p-3 rounded border transition ${isSelected ? 'border-primary bg-light shadow-sm' : 'bg-white'}`}
                                                    style={{ cursor: 'pointer', transition: 'all 0.15s ease-in-out' }}
                                                >
                                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                                        <span className="fw-bold text-dark fs-6">{room.name}</span>
                                                        <div>
                                                            {hasUnexcused ? (
                                                                <span className="badge bg-danger">Vắng {room.unexcused_count} KP</span>
                                                            ) : isDone ? (
                                                                <span className="badge bg-success"><i className="fas fa-check me-1"></i>Đã xong</span>
                                                            ) : (
                                                                <span className="badge bg-secondary">Chưa điểm danh</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="d-flex justify-content-between text-muted small">
                                                        <span>Sĩ số: <strong>{room.total_students}</strong> HS</span>
                                                        <span>
                                                            {isDone && (
                                                                <>
                                                                    <span className="text-success me-2">Có mặt: {room.present_count}</span>
                                                                    {hasLeave && <span className="text-warning text-dark me-2">Có phép: {room.leave_count}</span>}
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Cột phải: Bảng chi tiết điểm danh của phòng */}
                    <div className="col-lg-8 col-md-7">
                        <div className="card shadow-sm border-0" style={{ borderRadius: '10px' }}>
                            <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div>
                                    <h5 className="fw-bold mb-0 text-primary">
                                        Phòng {roomDetail?.name || selectedRoomId || '...'}
                                    </h5>
                                    <span className="text-muted small">
                                        Sức chứa: {roomDetail?.num_of_bed || '-'} giường | Hiện ở: {students.length} học sinh
                                    </span>
                                </div>
                                <div className="d-flex gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-success"
                                        onClick={handleMarkAllPresent}
                                        disabled={loadingDetail || students.length === 0}
                                        title="Đánh dấu tất cả học sinh chưa có phép thành Có mặt"
                                    >
                                        <i className="fas fa-check-double me-1"></i>Tất cả có mặt
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        style={{ background: '#00206d', borderColor: '#00206d' }}
                                        onClick={handleSaveAttendance}
                                        disabled={saving || loadingDetail || students.length === 0}
                                    >
                                        {saving ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-1"></span>Đang lưu...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-save me-1"></i>Lưu kết quả
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="card-body p-3">
                                {loadingDetail ? (
                                    <div className="p-5 text-center text-muted">
                                        <div className="spinner-border text-primary mb-2"></div>
                                        <div>Đang tải học sinh trong phòng...</div>
                                    </div>
                                ) : students.length === 0 ? (
                                    <div className="p-5 text-center text-muted">
                                        <i className="fas fa-bed fa-2x mb-3 text-secondary"></i>
                                        <div>Phòng này hiện chưa có học sinh nào được xếp ở.</div>
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column gap-3">
                                        {students.map((student, idx) => {
                                            const isLeave = student.status === 'ABSENT_LEAVE';
                                            const isUnexcused = student.status === 'ABSENT_UNEXCUSED';
                                            const isPresent = student.status === 'PRESENT';

                                            return (
                                                <div
                                                    key={student.id_student}
                                                    className="p-3 rounded border"
                                                    style={{
                                                        background: isUnexcused ? '#fff5f5' : isLeave ? '#fffbf0' : '#f8faff',
                                                        borderColor: isUnexcused ? '#ffcdd2' : isLeave ? '#ffe082' : '#e0e6ed'
                                                    }}
                                                >
                                                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                                                        <div className="d-flex align-items-center gap-2">
                                                            <span className="badge bg-secondary rounded-pill">{idx + 1}</span>
                                                            <div>
                                                                <span className="fw-bold fs-6 text-dark">{student.name}</span>
                                                                <span className="text-muted small ms-2">
                                                                    ({student.id_student})
                                                                </span>
                                                                {student.class_name && (
                                                                    <span className="badge bg-light text-dark border ms-2">
                                                                        Lớp {student.class_name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Nút bấm chọn trạng thái */}
                                                        <div className="btn-group btn-group-sm">
                                                            <button
                                                                type="button"
                                                                className={`btn ${isPresent ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                                                                onClick={() => handleStudentStatusChange(student.id_student, 'PRESENT')}
                                                            >
                                                                <i className="fas fa-check me-1"></i>Có mặt
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`btn ${isLeave ? 'btn-warning fw-bold text-dark' : 'btn-outline-warning text-dark'}`}
                                                                onClick={() => handleStudentStatusChange(student.id_student, 'ABSENT_LEAVE')}
                                                            >
                                                                <i className="fas fa-user-clock me-1"></i>Có phép
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`btn ${isUnexcused ? 'btn-danger fw-bold' : 'btn-outline-danger'}`}
                                                                onClick={() => handleStudentStatusChange(student.id_student, 'ABSENT_UNEXCUSED')}
                                                            >
                                                                <i className="fas fa-user-times me-1"></i>Không phép
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Nhận diện đơn nghỉ phép tự động */}
                                                    {student.has_approved_leave && (
                                                        <div className="alert alert-warning py-1 px-2 mb-2 small d-flex align-items-center gap-2">
                                                            <i className="fas fa-info-circle text-warning"></i>
                                                            <span>
                                                                <strong>Hệ thống nhận diện:</strong> Học sinh có đơn xin nghỉ đã duyệt ({student.leave_info?.leave_type}): <em>{student.leave_info?.reason}</em> ({student.leave_info?.start_time.slice(0, 10)} - {student.leave_info?.end_time.slice(0, 10)})
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Ô nhập ghi chú nhanh */}
                                                    <div>
                                                        <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            placeholder="Ghi chú (lý do vắng mặt, tình trạng sức khỏe, ghi nhận bất thường...)"
                                                            value={student.note || ''}
                                                            onChange={(e) => handleStudentNoteChange(student.id_student, e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <div className="d-flex justify-content-end mt-2">
                                            <button
                                                type="button"
                                                className="btn btn-primary px-4"
                                                style={{ background: '#00206d', borderColor: '#00206d' }}
                                                onClick={handleSaveAttendance}
                                                disabled={saving || students.length === 0}
                                            >
                                                {saving ? 'Đang lưu...' : 'Lưu kết quả điểm danh'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: BÁO CÁO & DANH SÁCH VẮNG MẶT */}
            {activeTab === 'summary' && (
                <div>
                    {/* Thẻ thống kê KPI */}
                    <div className="row g-3 mb-4">
                        <div className="col-md-3 col-sm-6">
                            <div className="card border-0 shadow-sm p-3 text-center" style={{ borderRadius: '10px', background: '#f8f9fa' }}>
                                <div className="text-muted small fw-bold">TỔNG HỌC SINH NỘI TRÚ</div>
                                <div className="fs-3 fw-bold text-dark">{summaryData.total_boarding}</div>
                            </div>
                        </div>
                        <div className="col-md-3 col-sm-6">
                            <div className="card border-0 shadow-sm p-3 text-center" style={{ borderRadius: '10px', background: '#e8f5e9' }}>
                                <div className="text-success small fw-bold">CÓ MẶT TẠI PHÒNG</div>
                                <div className="fs-3 fw-bold text-success">{summaryData.stats?.PRESENT || 0}</div>
                            </div>
                        </div>
                        <div className="col-md-3 col-sm-6">
                            <div className="card border-0 shadow-sm p-3 text-center" style={{ borderRadius: '10px', background: '#fff8e1' }}>
                                <div className="text-warning small fw-bold text-dark">VẮNG CÓ PHÉP</div>
                                <div className="fs-3 fw-bold text-warning text-dark">{summaryData.stats?.ABSENT_LEAVE || 0}</div>
                            </div>
                        </div>
                        <div className="col-md-3 col-sm-6">
                            <div className="card border-0 shadow-sm p-3 text-center" style={{ borderRadius: '10px', background: '#ffebee' }}>
                                <div className="text-danger small fw-bold">VẮNG KHÔNG PHÉP</div>
                                <div className="fs-3 fw-bold text-danger">{summaryData.stats?.ABSENT_UNEXCUSED || 0}</div>
                            </div>
                        </div>
                    </div>

                    {/* Bảng danh sách học sinh vắng mặt */}
                    <div className="card border-0 shadow-sm" style={{ borderRadius: '10px' }}>
                        <div className="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
                            <h5 className="fw-bold mb-0 text-danger">
                                <i className="fas fa-exclamation-triangle me-2"></i>Danh sách học sinh vắng mặt ngày {attDate}
                            </h5>
                            <button className="btn btn-sm btn-outline-success" onClick={handleExportExcel}>
                                <i className="fas fa-file-excel me-1"></i>Xuất Excel
                            </button>
                        </div>
                        <div className="card-body p-0">
                            {loadingSummary ? (
                                <div className="p-5 text-center text-muted">
                                    <div className="spinner-border text-primary me-2"></div>
                                    Đang tải dữ liệu tổng hợp...
                                </div>
                            ) : !summaryData.absent_students || summaryData.absent_students.length === 0 ? (
                                <div className="p-5 text-center text-success">
                                    <i className="fas fa-check-circle fa-3x mb-3 text-success"></i>
                                    <h5>Không có học sinh nào vắng mặt trong ngày {attDate}!</h5>
                                    <span className="text-muted">100% học sinh nội trú đã được ghi nhận có mặt.</span>
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover align-middle mb-0">
                                        <thead style={{ background: '#00206d', color: '#fff' }}>
                                            <tr>
                                                <th>Phòng</th>
                                                <th>Học sinh</th>
                                                <th>Lớp</th>
                                                <th>Giáo viên CN</th>
                                                <th>Trạng thái</th>
                                                <th>Lý do / Ghi chú</th>
                                                <th>Thời gian ghi nhận</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {summaryData.absent_students.map(item => (
                                                <tr key={item.id}>
                                                    <td className="fw-bold text-primary">{item.room_name}</td>
                                                    <td>
                                                        <div className="fw-bold text-dark">{item.student_name}</div>
                                                        <div className="small text-muted">{item.id_student}</div>
                                                    </td>
                                                    <td>{item.class_name ? `Lớp ${item.class_name}` : '-'}</td>
                                                    <td>{item.teacher_name || '-'}</td>
                                                    <td>
                                                        {item.status === 'ABSENT_LEAVE' ? (
                                                            <span className="badge bg-warning text-dark">
                                                                <i className="fas fa-check-circle me-1"></i>Có phép
                                                            </span>
                                                        ) : (
                                                            <span className="badge bg-danger">
                                                                <i className="fas fa-exclamation-circle me-1"></i>Không phép
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>{item.note || '-'}</td>
                                                    <td className="small text-muted">{item.updated_at || item.attendance_date}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Xác nhận */}
            <ConfirmModal
                show={confirmModal.show}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                onConfirm={() => {
                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                    closeConfirm();
                }}
                onCancel={closeConfirm}
            />

            {/* Modal Thông báo Toast/Alert */}
            {alertModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className={`modal-title fw-bold text-${alertModal.type}`}>
                                    {alertModal.title}
                                </h5>
                                <button type="button" className="btn-close" onClick={closeAlert}></button>
                            </div>
                            <div className="modal-body">
                                <p className="mb-0">{alertModal.message}</p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeAlert}>
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DormAttendance;
