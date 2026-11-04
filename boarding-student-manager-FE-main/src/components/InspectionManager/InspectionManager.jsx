import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import ConfirmModal from '../common/ConfirmModal';
import { useSearchParams } from 'react-router-dom';
import { formatDate } from '../../utils/dateFormatter';

const API = apiUrl('/api/inspection');
const API_CRIT = apiUrl('/api/inspection/criteria');
const API_DORM = apiUrl('/api/dormroom');

const emptyDetailModal = {
    show: false,
    title: '',
    mode: 'inspection',
    inspection: null,
    rows: [],
    weekStart: '',
    weekEnd: '',
};

const InspectionManager = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const user = getStoredUser() || {};
    const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };
    const roleName = user.role_name || roleMap[user.role_id] || '';
    const isTeacher = roleName === 'teacher';
    const scopeQuery = `username=${encodeURIComponent(user.username || '')}&role_name=${encodeURIComponent(roleName)}`;
    const teacherQuery = isTeacher && user.username ? `?teacher_id=${encodeURIComponent(user.username)}` : '';
    const [tab, setTab] = useState(() => {
        const t = searchParams.get('tab');
        if (t && ['score', 'list', 'criteria', 'summary'].includes(t)) {
            if (isTeacher && t !== 'list') return 'list';
            return t;
        }
        return isTeacher ? 'list' : 'score';
    });
    const [rooms, setRooms] = useState([]);
    const [criteria, setCriteria] = useState([]);
    const [inspections, setInspections] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState('');
    const [inspDate, setInspDate] = useState(new Date().toISOString().slice(0, 10));
    const [violations, setViolations] = useState([]);
    const [note, setNote] = useState('');
    const [roomStudents, setRoomStudents] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [critForm, setCritForm] = useState({ name: '', description: '', min_penalty: 0, max_penalty: 5 });
    const [editCritId, setEditCritId] = useState(null);
    const [summaryData, setSummaryData] = useState([]);
    const [summaryWeek, setSummaryWeek] = useState(new Date().toISOString().slice(0, 10));
    const [weekInfo, setWeekInfo] = useState({});

    useEffect(() => {
        const t = searchParams.get('tab');
        if (t && ['score', 'list', 'criteria', 'summary'].includes(t)) {
            if (isTeacher && t !== 'list') {
                setTab('list');
            } else {
                setTab(t);
                if (t === 'score' && !editingId) {
                    setInspDate(new Date().toISOString().slice(0, 10));
                }
            }
        } else {
            setTab(isTeacher ? 'list' : 'score');
            if (!isTeacher && !editingId) {
                setInspDate(new Date().toISOString().slice(0, 10));
            }
        }
    }, [searchParams, isTeacher, editingId]);
    const [selectedRoomIds, setSelectedRoomIds] = useState([]);
    const [showExportDrop, setShowExportDrop] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const [detailModal, setDetailModal] = useState(emptyDetailModal);
    const [listSearch, setListSearch] = useState('');
    const [listRoomFilter, setListRoomFilter] = useState('');
    const [listSeverityFilter, setListSeverityFilter] = useState('');

    const [sortRoomConfig, setSortRoomConfig] = useState({ key: null, direction: 'asc' });
    const [sortClassConfig, setSortClassConfig] = useState({ key: null, direction: 'asc' });

    const showConfirm = (title, message, onConfirm, type = 'confirm') => {
        setConfirmModal({ show: true, title, message, onConfirm, type });
    };
    const closeConfirm = () => setConfirmModal((prev) => ({ ...prev, show: false }));
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal((prev) => ({ ...prev, show: false }));
    const closeDetailModal = () => setDetailModal(emptyDetailModal);

    const handleSortRoom = (key) => {
        setSortRoomConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleSortClass = (key) => {
        setSortClassConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    useEffect(() => {
        fetch(`${API_DORM}/${teacherQuery}`).then((response) => response.json()).then((data) => {
            if (data.success) setRooms(data.data);
        });
        fetchCriteria();
    }, [teacherQuery]);

    useEffect(() => {
        const roomParam = searchParams.get('room');
        if (!roomParam) return;
        if (isTeacher) {
            setTab('list');
            setListRoomFilter(roomParam);
            setSearchParams({ tab: 'list' }, { replace: true });
            return;
        }
        setTab('score');
        setEditingId(null);
        setSelectedRoom(roomParam);
        loadRoomStudents(roomParam);
        setSearchParams({ tab: 'score' }, { replace: true });
    }, [isTeacher, searchParams, setSearchParams]);

    useEffect(() => {
        if (tab === 'list') fetchInspections();
    }, [tab, inspDate, listRoomFilter]);

    useEffect(() => {
        if (tab === 'summary') fetchSummary();
    }, [tab, summaryWeek]);

    const fetchCriteria = () => {
        fetch(`${API_CRIT}/`).then((response) => response.json()).then((data) => {
            if (data.success) setCriteria(data.data);
        });
    };

    const fetchInspections = () => {
        const params = new URLSearchParams({
            date: inspDate,
            username: user.username || '',
            role_name: roleName,
        });
        if (listRoomFilter) params.set('room_id', listRoomFilter);
        fetch(`${API}/?${params.toString()}`).then((response) => response.json()).then((data) => {
            if (data.success) setInspections(data.data);
        });
    };

    const fetchSummary = () => {
        fetch(`${API}/summary/weekly?date=${summaryWeek}`).then((response) => response.json()).then((data) => {
            if (data.success) {
                setSummaryData(data.data);
                setWeekInfo({ start: data.week_start, end: data.week_end });
            }
        });
    };

    const loadRoomStudents = (roomId) => {
        if (!roomId) {
            setRoomStudents([]);
            return;
        }
        const studentQuery = isTeacher && user.username ? `?teacher_id=${encodeURIComponent(user.username)}` : '';
        fetch(`${API_DORM}/${roomId}/students${studentQuery}`).then((response) => response.json()).then((data) => {
            if (data.success) setRoomStudents(data.data.students || []);
        });
    };

    const addViolation = () => {
        if (!criteria.length) {
            showAlert('Lỗi', 'Chưa có tiêu chí nào');
            return;
        }
        setViolations([
            ...violations,
            { criteria_id: criteria[0].id, penalty_points: criteria[0].min_penalty, id_student: '', note: '' },
        ]);
    };

    const removeViolation = (index) => {
        setViolations(violations.filter((_, currentIndex) => currentIndex !== index));
    };

    const updateViolation = (index, field, value) => {
        const nextViolations = [...violations];
        nextViolations[index] = { ...nextViolations[index], [field]: value };
        if (field === 'criteria_id') {
            const selectedCriteria = criteria.find((item) => item.id === Number(value));
            if (selectedCriteria) {
                nextViolations[index].penalty_points = selectedCriteria.min_penalty;
            }
        }
        setViolations(nextViolations);
    };

    const resetForm = () => {
        setViolations([]);
        setNote('');
        setEditingId(null);
        setSelectedRoom('');
        setRoomStudents([]);
        setInspDate(new Date().toISOString().slice(0, 10));
    };

    const saveInspection = () => {
        if (!selectedRoom) {
            showAlert('Lỗi', 'Chọn phòng');
            return;
        }

        const body = {
            id_dormroom: selectedRoom,
            inspection_date: inspDate,
            inspected_by: user.username,
            role_name: roleName,
            note,
            violations: violations.map((item) => ({
                ...item,
                id_student: item.id_student || null,
                penalty_points: Number(item.penalty_points),
            })),
        };

        const url = editingId ? `${API}/${editingId}` : `${API}/`;
        const method = editingId ? 'PUT' : 'POST';

        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    showAlert('Thành công', data.message);
                    resetForm();
                    if (tab === 'list') fetchInspections();
                    if (tab === 'summary') fetchSummary();
                } else {
                    showAlert('Lỗi', data.message || data.error);
                }
            });
    };

    const loadInspection = (id) => {
        fetch(`${API}/${id}?${scopeQuery}`).then((response) => response.json()).then((data) => {
            if (data.success) {
                const inspection = data.data;
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', 'score');
                    return next;
                });
                setSelectedRoom(inspection.id_dormroom);
                setInspDate(inspection.inspection_date);
                setNote(inspection.note || '');
                setEditingId(inspection.id);
                setViolations((inspection.violations || []).map((item) => ({
                    criteria_id: item.criteria_id,
                    penalty_points: item.penalty_points,
                    id_student: item.id_student || '',
                    note: item.note || '',
                })));
                setRoomStudents(inspection.room_students || []);
            }
        });
    };

    const openEditInspection = (inspectionId) => {
        closeDetailModal();
        loadInspection(inspectionId);
    };

    const viewInspectionDetails = (inspectionId) => {
        fetch(`${API}/${inspectionId}?${scopeQuery}`).then((response) => response.json()).then((data) => {
            if (data.success) {
                const inspection = data.data;
                setDetailModal({
                    show: true,
                    title: `Chi tiết biên bản phòng ${inspection.room_name || inspection.id_dormroom}`,
                    mode: 'inspection',
                    inspection,
                    rows: inspection.violations || [],
                    weekStart: '',
                    weekEnd: '',
                });
            } else {
                showAlert('Lỗi', data.message || data.error || 'Không tải được chi tiết');
            }
        });
    };

    const viewSummaryDetails = (summaryType, refId) => {
        fetch(`${API}/summary/details?date=${summaryWeek}&summary_type=${summaryType}&ref_id=${encodeURIComponent(refId)}`)
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    setDetailModal({
                        show: true,
                        title: `Chi tiết tuần - ${summaryType === 'ROOM' ? 'Phòng' : 'Lớp'} ${refId}`,
                        mode: 'summary',
                        inspection: null,
                        rows: data.data || [],
                        weekStart: data.week_start || '',
                        weekEnd: data.week_end || '',
                    });
                } else {
                    showAlert('Lỗi', data.message || data.error || 'Không tải được chi tiết');
                }
            });
    };

    const deleteInspection = (id) => {
        showConfirm('Xóa biên bản', 'Bạn có chắc muốn xóa biên bản này?', () => {
            closeConfirm();
            fetch(`${API}/${id}?role_name=${encodeURIComponent(roleName)}`, { method: 'DELETE' }).then((response) => response.json()).then((data) => {
                if (data.success) {
                    fetchInspections();
                    fetchSummary();
                } else {
                    showAlert('Lỗi', data.message || data.error);
                }
            });
        }, 'danger');
    };

    const saveCriteria = () => {
        if (!critForm.name.trim()) {
            showAlert('Lỗi', 'Tên tiêu chí bắt buộc');
            return;
        }
        const url = editCritId ? `${API_CRIT}/${editCritId}` : `${API_CRIT}/`;
        const method = editCritId ? 'PUT' : 'POST';
        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(critForm) })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    fetchCriteria();
                    setCritForm({ name: '', description: '', min_penalty: 0, max_penalty: 5 });
                    setEditCritId(null);
                } else {
                    showAlert('Lỗi', data.message || data.error);
                }
            });
    };

    const deleteCriteria = (id) => {
        showConfirm('Xóa tiêu chí', 'Xóa vĩnh viễn tiêu chí này?', () => {
            closeConfirm();
            fetch(`${API_CRIT}/${id}`, { method: 'DELETE' }).then((response) => response.json()).then((data) => {
                if (data.success) fetchCriteria();
            });
        }, 'danger');
    };

    const generateSummary = () => {
        fetch(`${API}/summary/generate?date=${summaryWeek}`, { method: 'POST' }).then((response) => response.json()).then((data) => {
            if (data.success) {
                showAlert('Thành công', data.message);
                fetchSummary();
            } else {
                showAlert('Lỗi', data.error || data.message);
            }
        });
    };

    const exportFile = (type) => {
        let url = `${API}/summary/export?date=${summaryWeek}&type=${type}`;
        if (type === 'detail' && selectedRoomIds.length) {
            url += `&room_ids=${selectedRoomIds.join(',')}`;
        }
        window.open(url, '_blank');
        setShowExportDrop(false);
    };

    const toggleRoomSelect = (roomId) => {
        setSelectedRoomIds((prev) => (prev.includes(roomId) ? prev.filter((item) => item !== roomId) : [...prev, roomId]));
    };

    const roomSummary = summaryData.filter((item) => item.summary_type === 'ROOM');
    const classSummary = summaryData.filter((item) => item.summary_type === 'CLASS');

    const sortedRoomSummary = useMemo(() => {
        const items = [...roomSummary];
        if (!sortRoomConfig.key) return items;

        items.sort((left, right) => {
            if (sortRoomConfig.key === 'ref_id') {
                const splitRoom = (value = '') => {
                    const match = String(value).match(/([a-zA-Z]+)(\d+)/);
                    if (match) return [match[1].toLowerCase(), parseInt(match[2], 10)];
                    return [String(value).toLowerCase(), 0];
                };
                const [leftLetters, leftNumber] = splitRoom(left.ref_id);
                const [rightLetters, rightNumber] = splitRoom(right.ref_id);
                if (leftLetters !== rightLetters) {
                    return sortRoomConfig.direction === 'asc'
                        ? leftLetters.localeCompare(rightLetters)
                        : rightLetters.localeCompare(leftLetters);
                }
                return sortRoomConfig.direction === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
            }

            const leftValue = Number(left[sortRoomConfig.key]) || 0;
            const rightValue = Number(right[sortRoomConfig.key]) || 0;
            return sortRoomConfig.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
        });

        return items;
    }, [roomSummary, sortRoomConfig]);

    const sortedClassSummary = useMemo(() => {
        const items = [...classSummary];
        if (!sortClassConfig.key) return items;

        items.sort((left, right) => {
            if (sortClassConfig.key === 'ref_id') {
                return sortClassConfig.direction === 'asc'
                    ? left.ref_id.localeCompare(right.ref_id)
                    : right.ref_id.localeCompare(left.ref_id);
            }
            const leftValue = Number(left[sortClassConfig.key]) || 0;
            const rightValue = Number(right[sortClassConfig.key]) || 0;
            return sortClassConfig.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
        });

        return items;
    }, [classSummary, sortClassConfig]);

    const filteredInspections = useMemo(() => {
        const keyword = listSearch.trim().toLowerCase();
        return inspections.filter((inspection) => {
            if (listSeverityFilter === 'has_violations' && Number(inspection.violation_count || 0) <= 0) return false;
            if (listSeverityFilter === 'heavy' && Number(inspection.total_penalty || 0) < 5) return false;
            if (!keyword) return true;
            return `${inspection.room_name || ''} ${inspection.id_dormroom || ''} ${inspection.inspection_date || ''}`
                .toLowerCase()
                .includes(keyword);
        });
    }, [inspections, listSearch, listSeverityFilter]);

    const getSortIcon = (config, key) => {
        if (config.key !== key) return <i className="fas fa-sort text-muted ms-1" style={{ opacity: 0.5 }}></i>;
        return config.direction === 'asc' ? <i className="fas fa-sort-up ms-1"></i> : <i className="fas fa-sort-down ms-1"></i>;
    };

    const tabBtn = (id, label) => (
        <button
            className={`btn ${tab === id ? 'btn-primary' : 'btn-outline-primary'}`}
            style={tab === id ? { background: '#00206d', borderColor: '#00206d' } : {}}
            onClick={() => {
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', id);
                    return next;
                });
            }}
        >
            {label}
        </button>
    );

    const renderInspectionDetailModal = () => {
        const inspection = detailModal.inspection;
        if (!inspection) return null;

        return (
            <>
                <div className="row g-3 mb-3">
                    <div className="col-md-3">
                        <div className="small text-muted">Phòng</div>
                        <div className="fw-semibold">{inspection.room_name || inspection.id_dormroom}</div>
                    </div>
                    <div className="col-md-3">
                        <div className="small text-muted">Ngày chấm</div>
                        <div className="fw-semibold">{formatDate(inspection.inspection_date)}</div>
                    </div>
                    <div className="col-md-3">
                        <div className="small text-muted">Số lỗi</div>
                        <div className="fw-semibold">{detailModal.rows.length}</div>
                    </div>
                    <div className="col-md-3">
                        <div className="small text-muted">Tổng điểm trừ</div>
                        <div className="fw-semibold text-danger">{Number(inspection.total_penalty || 0).toFixed(1)}</div>
                    </div>
                </div>
                {inspection.note && (
                    <div className="alert alert-light border mb-3">
                        <div className="small text-muted mb-1">Ghi chú</div>
                        <div>{inspection.note}</div>
                    </div>
                )}
                <div className="table-responsive">
                    <table className="table table-hover">
                        <thead className="table-light">
                            <tr>
                                <th>Tiêu chí</th>
                                <th>Học sinh vi phạm</th>
                                <th>Điểm trừ</th>
                                <th>Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detailModal.rows.map((row, index) => (
                                <tr key={`${row.criteria_id || row.criteria_name}-${index}`}>
                                    <td>{row.criteria_name}</td>
                                    <td>{row.student_name || 'Cả phòng'}</td>
                                    <td className="text-danger fw-semibold">-{Number(row.penalty_points || 0)}</td>
                                    <td>{row.note || '-'}</td>
                                </tr>
                            ))}
                            {detailModal.rows.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center text-muted">Biên bản này chưa có lỗi chi tiết</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </>
        );
    };

    const renderSummaryDetailModal = () => (
        <>
            {(detailModal.weekStart || detailModal.weekEnd) && (
                <div className="small text-muted mb-3">
                    Tuần: {formatDate(detailModal.weekStart)} - {formatDate(detailModal.weekEnd)}
                </div>
            )}
            <div className="table-responsive">
                <table className="table table-hover">
                    <thead className="table-light">
                        <tr>
                            <th>Ngày</th>
                            <th>Phòng</th>
                            <th>Học sinh vi phạm</th>
                            <th>Tiêu chí</th>
                            <th>Điểm trừ</th>
                            <th>Ghi chú</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detailModal.rows.map((row, index) => (
                            <tr key={`${row.inspection_id || 'inspection'}-${index}`}>
                                <td>{formatDate(row.inspection_date)}</td>
                                <td>{row.room_name || row.id_dormroom}</td>
                                <td>{row.student_name || 'Cả phòng'}</td>
                                <td>{row.criteria_name}</td>
                                <td className="text-danger fw-semibold">-{Number(row.penalty_points || 0)}</td>
                                <td>{row.note || '-'}</td>
                                <td>
                                    {!isTeacher && (
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => openEditInspection(row.inspection_id)}>
                                            <i className="fas fa-edit me-1"></i>Sửa
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {detailModal.rows.length === 0 && (
                            <tr>
                                <td colSpan="7" className="text-center text-muted">Không có lỗi chi tiết trong tuần này</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ color: '#00206d', fontWeight: 700, marginBottom: 16 }}>Chấm điểm phòng ở</h2>
            {/* <div className="d-flex gap-2 mb-3 flex-wrap">
                {!isTeacher && tabBtn('score', 'Chấm điểm')}
                {tabBtn('list', 'Danh sách')}
                {!isTeacher && tabBtn('criteria', 'Tiêu chí')}
                {!isTeacher && tabBtn('summary', 'Tổng hợp tuần')}
            </div> */}

            {!isTeacher && tab === 'score' && (
                <div className="bg-white rounded p-4 shadow-sm">
                    <div className="row mb-3">
                        <div className="col-md-4 mb-2">
                            <label className="form-label fw-bold">Phòng</label>
                            <select
                                className="form-select"
                                value={selectedRoom}
                                onChange={(event) => {
                                    setSelectedRoom(event.target.value);
                                    loadRoomStudents(event.target.value);
                                }}
                            >
                                <option value="">-- Chọn phòng --</option>
                                {rooms.map((room) => (
                                    <option key={room.id} value={room.id}>{room.name} ({room.id})</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3 mb-2">
                            <label className="form-label fw-bold">Ngày chấm</label>
                            <input
                                type="text"
                                className="form-control bg-light text-muted"
                                value={formatDate(inspDate)}
                                readOnly
                                disabled
                                style={{ cursor: 'not-allowed' }}
                            />
                        </div>
                        <div className="col-md-5 mb-2">
                            <label className="form-label fw-bold">Ghi chú</label>
                            <input className="form-control" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú biên bản..." />
                        </div>
                    </div>

                    {roomStudents.length > 0 && (
                        <div className="mb-3 p-2 bg-light rounded small">
                            <strong>Học sinh trong phòng:</strong> {roomStudents.map((student) => `${student.name} (${student.class_name || '?'})`).join(', ')}
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="fw-bold mb-0">Danh sách lỗi</h6>
                        <button className="btn btn-sm btn-outline-primary" onClick={addViolation}>
                            <i className="fas fa-plus me-1"></i>Thêm lỗi
                        </button>
                    </div>

                    {violations.map((violation, index) => {
                        const selectedCriteria = criteria.find((item) => item.id === Number(violation.criteria_id));
                        return (
                            <div key={index} className="border rounded p-3 mb-2">
                                <div className="row g-2 align-items-end">
                                    <div className="col-md-3">
                                        <label className="form-label small">Tiêu chí</label>
                                        <select
                                            className="form-select form-select-sm"
                                            value={violation.criteria_id}
                                            onChange={(event) => updateViolation(index, 'criteria_id', event.target.value)}
                                        >
                                            {criteria.map((item) => (
                                                <option key={item.id} value={item.id}>{item.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small">Điểm trừ {selectedCriteria ? `(${selectedCriteria.min_penalty}-${selectedCriteria.max_penalty})` : ''}</label>
                                        <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={violation.penalty_points}
                                            min={selectedCriteria?.min_penalty || 0}
                                            max={selectedCriteria?.max_penalty || 10}
                                            step="0.5"
                                            onChange={(event) => updateViolation(index, 'penalty_points', event.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small">HS vi phạm</label>
                                        <select
                                            className="form-select form-select-sm"
                                            value={violation.id_student}
                                            onChange={(event) => updateViolation(index, 'id_student', event.target.value)}
                                        >
                                            <option value="">Cả phòng</option>
                                            {roomStudents.map((student) => (
                                                <option key={student.id_VNeID} value={student.id_VNeID}>{student.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small">Ghi chú</label>
                                        <input className="form-control form-control-sm" value={violation.note} onChange={(event) => updateViolation(index, 'note', event.target.value)} />
                                    </div>
                                    <div className="col-md-1 text-end">
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => removeViolation(index)}>
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {violations.length > 0 && (
                        <div className="fw-bold text-end mb-2">
                            Tổng điểm trừ: {violations.reduce((sum, item) => sum + Number(item.penalty_points || 0), 0).toFixed(1)}
                        </div>
                    )}

                    <div className="text-end mt-3">
                        {editingId && <button className="btn btn-secondary me-2" onClick={resetForm}>Hủy sửa</button>}
                        <button className="btn btn-primary" style={{ background: '#00206d' }} onClick={saveInspection}>
                            <i className="fas fa-save me-1"></i>{editingId ? 'Cập nhật' : 'Lưu biên bản'}
                        </button>
                    </div>
                </div>
            )}

            {tab === 'list' && (
                <div className="bg-white rounded p-4 shadow-sm">
                    <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                        <input type="date" lang="en-GB" className="form-control" style={{ maxWidth: 180 }} value={inspDate} onChange={(event) => setInspDate(event.target.value)} />
                        <select className="form-select" style={{ maxWidth: 220 }} value={listRoomFilter} onChange={(event) => setListRoomFilter(event.target.value)}>
                            <option value="">Tất cả phòng</option>
                            {rooms.map((room) => (
                                <option key={room.id} value={room.id}>{room.name} ({room.id})</option>
                            ))}
                        </select>
                        <select className="form-select" style={{ maxWidth: 180 }} value={listSeverityFilter} onChange={(event) => setListSeverityFilter(event.target.value)}>
                            <option value="">Tất cả mức độ</option>
                            <option value="has_violations">Có lỗi</option>
                            <option value="heavy">Từ 5 điểm trở lên</option>
                        </select>
                        <input
                            className="form-control"
                            style={{ maxWidth: 280 }}
                            placeholder="Tìm theo phòng, mã phòng, ngày..."
                            value={listSearch}
                            onChange={(event) => setListSearch(event.target.value)}
                        />
                        <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => {
                                setListRoomFilter('');
                                setListSeverityFilter('');
                                setListSearch('');
                            }}
                        >
                            Xóa lọc
                        </button>
                    </div>
                    <table className="table table-hover">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th>Phòng</th>
                                <th>Ngày</th>
                                <th>Số lỗi</th>
                                <th>Tổng điểm trừ</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInspections.map((inspection) => (
                                <tr key={inspection.id}>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-link p-0 text-decoration-none fw-semibold"
                                            onClick={() => viewInspectionDetails(inspection.id)}
                                        >
                                            {inspection.room_name} ({inspection.id_dormroom})
                                        </button>
                                    </td>
                                    <td>{formatDate(inspection.inspection_date)}</td>
                                    <td><span className="badge bg-warning text-dark">{inspection.violation_count}</span></td>
                                    <td><span className={`badge ${inspection.total_penalty >= 5 ? 'bg-danger' : 'bg-secondary'}`}>{inspection.total_penalty}</span></td>
                                    <td>
                                        {!isTeacher && (
                                            <>
                                                <button className="btn btn-sm btn-outline-primary me-1" onClick={() => loadInspection(inspection.id)}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => deleteInspection(inspection.id)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredInspections.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center text-muted">Chưa có biên bản nào</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isTeacher && tab === 'criteria' && (
                <div className="bg-white rounded p-4 shadow-sm">
                    <div className="row g-2 mb-3 align-items-end">
                        <div className="col-md-3">
                            <label className="form-label small fw-bold">Tên *</label>
                            <input className="form-control form-control-sm" value={critForm.name} onChange={(event) => setCritForm({ ...critForm, name: event.target.value })} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label small fw-bold">Mô tả</label>
                            <input className="form-control form-control-sm" value={critForm.description} onChange={(event) => setCritForm({ ...critForm, description: event.target.value })} />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label small fw-bold">Min</label>
                            <input type="number" className="form-control form-control-sm" value={critForm.min_penalty} step="0.5" onChange={(event) => setCritForm({ ...critForm, min_penalty: Number(event.target.value) })} />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label small fw-bold">Max</label>
                            <input type="number" className="form-control form-control-sm" value={critForm.max_penalty} step="0.5" onChange={(event) => setCritForm({ ...critForm, max_penalty: Number(event.target.value) })} />
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-sm btn-primary w-100" style={{ background: '#00206d' }} onClick={saveCriteria}>
                                {editCritId ? 'Cập nhật' : 'Thêm'}
                            </button>
                            {editCritId && (
                                <button className="btn btn-sm btn-secondary w-100 mt-1" onClick={() => {
                                    setEditCritId(null);
                                    setCritForm({ name: '', description: '', min_penalty: 0, max_penalty: 5 });
                                }}>
                                    Hủy
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="d-flex gap-2 mb-3">
                        <a href={`${API_CRIT}/template`} className="btn btn-sm btn-outline-secondary">
                            <i className="fas fa-download me-1"></i>File mẫu Excel
                        </a>
                        <a href={`${API_CRIT}/export`} className="btn btn-sm btn-outline-success">
                            <i className="fas fa-file-excel me-1"></i>Xuất Excel
                        </a>
                        <label className="btn btn-sm btn-success mb-0" style={{ cursor: 'pointer' }}>
                            <i className="fas fa-upload me-1"></i>Nhập Excel
                            <input
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                style={{ display: 'none' }}
                                onChange={(event) => {
                                    const file = event.target.files[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    fetch(`${API_CRIT}/upload`, { method: 'POST', body: formData }).then((response) => response.json()).then((data) => {
                                        showAlert(data.success ? 'Thành công' : 'Lỗi', data.message || data.error);
                                        if (data.success) fetchCriteria();
                                    });
                                }}
                            />
                        </label>
                    </div>

                    <table className="table table-hover">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th>Tên</th>
                                <th>Mô tả</th>
                                <th>Min</th>
                                <th>Max</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {criteria.map((item) => (
                                <tr key={item.id}>
                                    <td className="fw-bold">{item.name}</td>
                                    <td>{item.description || '-'}</td>
                                    <td>{item.min_penalty}</td>
                                    <td>{item.max_penalty}</td>
                                    <td>
                                        <button
                                            className="btn btn-sm btn-outline-primary me-1"
                                            onClick={() => {
                                                setEditCritId(item.id);
                                                setCritForm({
                                                    name: item.name,
                                                    description: item.description || '',
                                                    min_penalty: item.min_penalty,
                                                    max_penalty: item.max_penalty,
                                                });
                                            }}
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteCriteria(item.id)}>
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {criteria.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center text-muted">Chưa có tiêu chí</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isTeacher && tab === 'summary' && (
                <div className="bg-white rounded p-4 shadow-sm">
                    <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                        <input type="date" lang="en-GB" className="form-control" style={{ maxWidth: 180 }} value={summaryWeek} onChange={(event) => setSummaryWeek(event.target.value)} />
                        {weekInfo.start && <span className="text-muted small">Tuần: {formatDate(weekInfo.start)} - {formatDate(weekInfo.end)}</span>}
                        <button className="btn btn-sm btn-outline-primary" onClick={generateSummary}>
                            <i className="fas fa-sync me-1"></i>Tổng hợp
                        </button>
                        <div className="position-relative">
                            <button className="btn btn-sm btn-success" onClick={() => setShowExportDrop(!showExportDrop)}>
                                <i className="fas fa-file-excel me-1"></i>Xuất XLSX <i className="fas fa-caret-down ms-1"></i>
                            </button>
                            {showExportDrop && (
                                <div className="position-absolute bg-white border rounded shadow-sm p-2 mt-1" style={{ zIndex: 10, minWidth: 200 }}>
                                    <button className="dropdown-item py-1" onClick={() => exportFile('summary')}>Tổng hợp (Phòng + Lớp)</button>
                                    <button className="dropdown-item py-1" onClick={() => exportFile('detail')}>
                                        Chi tiết lỗi {selectedRoomIds.length ? `(${selectedRoomIds.length} phòng)` : ''}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <h6 className="fw-bold mt-3 mb-2">Theo phòng</h6>
                    <table className="table table-hover mb-4">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th style={{ width: 40 }}>
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={selectedRoomIds.length === roomSummary.length && roomSummary.length > 0}
                                        onChange={(event) => setSelectedRoomIds(event.target.checked ? roomSummary.map((item) => item.ref_id) : [])}
                                    />
                                </th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortRoom('ref_id')}>Phòng {getSortIcon(sortRoomConfig, 'ref_id')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortRoom('total_penalty')}>Tổng điểm trừ {getSortIcon(sortRoomConfig, 'total_penalty')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortRoom('total_violations')}>Số lỗi {getSortIcon(sortRoomConfig, 'total_violations')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRoomSummary.map((item) => (
                                <tr key={item.ref_id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={selectedRoomIds.includes(item.ref_id)}
                                            onChange={() => toggleRoomSelect(item.ref_id)}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-link p-0 text-decoration-none fw-semibold"
                                            onClick={() => viewSummaryDetails('ROOM', item.ref_id)}
                                        >
                                            {item.ref_id}
                                        </button>
                                    </td>
                                    <td><span className={`badge ${item.total_penalty >= 5 ? 'bg-danger' : 'bg-secondary'}`}>{item.total_penalty}</span></td>
                                    <td><span className={`badge ${item.total_violations >= 5 ? 'bg-danger' : 'bg-warning text-dark'}`}>{item.total_violations}</span></td>
                                </tr>
                            ))}
                            {sortedRoomSummary.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center text-muted">Chưa có dữ liệu</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <h6 className="fw-bold mb-2">Theo lớp</h6>
                    <table className="table table-hover">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortClass('ref_id')}>Lớp {getSortIcon(sortClassConfig, 'ref_id')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortClass('total_penalty')}>Tổng điểm trừ {getSortIcon(sortClassConfig, 'total_penalty')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSortClass('total_violations')}>Số lỗi {getSortIcon(sortClassConfig, 'total_violations')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedClassSummary.map((item) => (
                                <tr key={item.ref_id}>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-link p-0 text-decoration-none fw-semibold"
                                            onClick={() => viewSummaryDetails('CLASS', item.ref_id)}
                                        >
                                            {item.ref_id}
                                        </button>
                                    </td>
                                    <td><span className={`badge ${item.total_penalty >= 5 ? 'bg-danger' : 'bg-secondary'}`}>{item.total_penalty}</span></td>
                                    <td>{item.total_violations}</td>
                                </tr>
                            ))}
                            {sortedClassSummary.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="text-center text-muted">Chưa có dữ liệu</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {detailModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1050 }}>
                    <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{detailModal.title}</h5>
                                <button type="button" className="btn-close" onClick={closeDetailModal}></button>
                            </div>
                            <div className="modal-body">
                                {detailModal.mode === 'inspection' ? renderInspectionDetailModal() : renderSummaryDetailModal()}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={closeDetailModal}>Đóng</button>
                                {!isTeacher && detailModal.mode === 'inspection' && detailModal.inspection?.id && (
                                    <button className="btn btn-primary" style={{ background: '#00206d', borderColor: '#00206d' }} onClick={() => openEditInspection(detailModal.inspection.id)}>
                                        <i className="fas fa-edit me-1"></i>Sửa biên bản
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                show={confirmModal.show}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirm}
                type={confirmModal.type}
            />
            <ConfirmModal show={alertModal.show} title={alertModal.title} message={alertModal.message} onCancel={closeAlert} type="alert" />
        </div>
    );
};

export default InspectionManager;
