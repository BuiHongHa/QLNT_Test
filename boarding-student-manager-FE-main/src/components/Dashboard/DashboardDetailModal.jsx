import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../config/api';
import ConfirmModal from '../common/ConfirmModal';

const API_LEAVE = apiUrl('/api/leave');
const API_DORMROOM = apiUrl('/api/dormroom');

const leaveTypeText = {
    AFTER_SCHOOL: 'Sau giờ học',
    EMERGENCY: 'Đột xuất',
    REGULAR_WEEKEND: 'Thường xuyên',
};

const splitStringForSort = (value = '') => {
    const text = String(value).toLowerCase();
    const letters = text.replace(/[0-9]/g, '');
    const digits = text.replace(/\D/g, '');
    return { letters, number: digits ? Number(digits) : 0, raw: text };
};

const compareAlphaNumeric = (leftValue, rightValue) => {
    const left = splitStringForSort(leftValue);
    const right = splitStringForSort(rightValue);
    if (left.letters !== right.letters) return left.letters.localeCompare(right.letters, 'vi');
    if (left.number !== right.number) return left.number - right.number;
    return left.raw.localeCompare(right.raw, 'vi');
};

const splitVietnameseName = (value = '') => {
    const normalized = String(value).trim().replace(/\s+/g, ' ');
    if (!normalized) return { givenName: '', remainingName: '' };
    const parts = normalized.split(' ');
    return {
        givenName: parts[parts.length - 1].toLowerCase(),
        remainingName: parts.slice(0, -1).join(' ').toLowerCase(),
    };
};

const compareVietnameseName = (leftValue, rightValue) => {
    const left = splitVietnameseName(leftValue);
    const right = splitVietnameseName(rightValue);
    const givenCompare = left.givenName.localeCompare(right.givenName, 'vi');
    if (givenCompare !== 0) return givenCompare;
    return left.remainingName.localeCompare(right.remainingName, 'vi');
};

const leaveTypes = new Set([
    'leave_requests_this_week',
    'approved_leaves',
    'pending_leaves',
    'leave_requests_after_school',
    'leave_requests_emergency',
    'approved_leaves_this_week',
    'outside_today_after_school',
    'outside_today_emergency',
    'outside_today_regular_weekend',
    'regular_leave_requests',
    'student_leave_requests_this_week',
    'student_leave_requests_today',
    'student_pending_leaves_this_week',
]);

const roomTypes = new Set(['inspected_rooms', 'not_inspected_rooms', 'heavy_rooms']);
const roomRequestTypes = new Set(['room_change_requests']);
const accessTypes = new Set([
    'guard_out_today',
    'guard_in_today',
    'guard_out_week',
    'guard_in_week',
    'guard_abnormal_today',
    'guard_abnormal_week',
]);

const DashboardDetailModal = ({
    title,
    data = [],
    type,
    onClose,
    role,
    user,
    onRefresh,
    onInspectRoom,
}) => {
    const [rows, setRows] = useState(data);
    const [filterCriteria, setFilterCriteria] = useState('');
    const [searchText, setSearchText] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [roomFilter, setRoomFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const pageSize = 20;

    useEffect(() => {
        setRows(data);
    }, [data]);

    const isInspection = type === 'inspection';
    const isStudentList = type === 'students' || type === 'total_students';
    const isLeaveList = leaveTypes.has(type);
    const isRoomList = roomTypes.has(type);
    const isRoomRequestList = roomRequestTypes.has(type);
    const isAccessList = accessTypes.has(type);
    const isOverdueList = type === 'overdue_students';
    const isPendingLeaves = type === 'pending_leaves' && ['manager', 'teacher', 'dorm_manager'].includes(role);
    const isPendingRoomRequests = type === 'room_change_requests' && (role === 'manager' || role === 'dorm_manager');

    const closeConfirm = () => setConfirmModal((prev) => ({ ...prev, show: false }));
    const showConfirm = (confirmTitle, message, onConfirm, confirmType = 'confirm') => {
        setConfirmModal({ show: true, title: confirmTitle, message, onConfirm, type: confirmType });
    };
    const closeAlert = () => setAlertModal((prev) => ({ ...prev, show: false }));
    const showAlert = (alertTitle, message) => setAlertModal({ show: true, title: alertTitle, message });

    const handleSort = (key) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
        setCurrentPage(1);
    };

    const handleLeaveAction = (row, actionType) => {
        const payload = { username: user?.username || '', role_name: role };

        if (actionType === 'delete') {
            showConfirm('Xóa đơn nghỉ phép', 'Bạn có muốn xóa mềm đơn nghỉ phép này không?', () => {
                closeConfirm();
                fetch(`${API_LEAVE}/${row.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                    .then((response) => response.json())
                    .then((result) => {
                        if (result.success) {
                            const nextRows = rows.filter((item) => item.id !== row.id);
                            setRows(nextRows);
                            onRefresh?.();
                        } else {
                            showAlert('Lỗi', result.message || result.error || 'Không thể xóa đơn');
                        }
                    });
            }, 'danger');
            return;
        }

        const nextStatus = actionType === 'accept' ? 'ACCEPTED' : 'DENIED';
        let url = `${API_LEAVE}/${row.id}/status`;
        if (row.leave_type === 'REGULAR_WEEKEND') {
            const isParentAccepted = (row.teacher_accept || 'PENDING') === 'ACCEPTED' && (row.manager_accept || 'PENDING') === 'ACCEPTED';
            if (isParentAccepted) {
                url = `${API_LEAVE}/${row.id}/current-week-status`;
            }
        }
        fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, status: nextStatus }),
        })
            .then((response) => response.json())
            .then((result) => {
                if (result.success) {
                    const nextRows = rows.filter((item) => item.id !== row.id);
                    setRows(nextRows);
                    onRefresh?.();
                } else {
                    showAlert('Lỗi', result.message || result.error || 'Không thể cập nhật trạng thái');
                }
            });
    };

    const handleRoomRequestAction = (row, status) => {
        fetch(`${API_DORMROOM}/requests/${row.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
            .then((response) => response.json())
            .then((result) => {
                if (result.success) {
                    const nextRows = rows.filter((item) => item.id !== row.id);
                    setRows(nextRows);
                    onRefresh?.();
                } else {
                    showAlert('Lỗi', result.message || result.error || 'Không thể cập nhật yêu cầu chuyển phòng');
                }
            });
    };

    const criteriaList = useMemo(() => {
        if (!isInspection) return [];
        return [...new Set(rows.map((item) => item.criteria_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    }, [rows, isInspection]);

    const classOptions = useMemo(() => {
        return [...new Set(rows.map((item) => item.class_name).filter(Boolean))].sort((a, b) => compareAlphaNumeric(a, b));
    }, [rows]);

    const roomOptions = useMemo(() => {
        return [...new Set(rows.map((item) => item.room_id || item.id_dormroom || item.room_name).filter(Boolean))].sort((a, b) => compareAlphaNumeric(a, b));
    }, [rows]);

    const processedData = useMemo(() => {
        let filteredRows = [...rows];

        if (isInspection && filterCriteria) {
            filteredRows = filteredRows.filter((item) => item.criteria_name === filterCriteria);
        }

        if (classFilter) {
            filteredRows = filteredRows.filter((item) => item.class_name === classFilter);
        }

        if (roomFilter) {
            filteredRows = filteredRows.filter((item) => (item.room_id || item.id_dormroom || item.room_name) === roomFilter);
        }

        if (searchText.trim()) {
            const keyword = searchText.trim().toLowerCase();
            filteredRows = filteredRows.filter((item) => Object.values(item || {}).some((value) => String(value ?? '').toLowerCase().includes(keyword)));
        }

        if (!sortConfig.key) {
            return filteredRows;
        }

        filteredRows.sort((left, right) => {
            const leftValue = left?.[sortConfig.key] ?? '';
            const rightValue = right?.[sortConfig.key] ?? '';

            let compareValue = 0;
            if (['name', 'student_name'].includes(sortConfig.key)) {
                compareValue = compareVietnameseName(leftValue, rightValue);
            } else if (['room_id', 'room_name', 'id_dormroom', 'ref_id', 'class_name'].includes(sortConfig.key)) {
                compareValue = compareAlphaNumeric(leftValue, rightValue);
            } else if (!Number.isNaN(Number(leftValue)) && !Number.isNaN(Number(rightValue)) && leftValue !== '' && rightValue !== '') {
                compareValue = Number(leftValue) - Number(rightValue);
            } else {
                compareValue = String(leftValue).localeCompare(String(rightValue), 'vi');
            }

            return sortConfig.direction === 'asc' ? compareValue : -compareValue;
        });

        return filteredRows;
    }, [rows, filterCriteria, classFilter, roomFilter, searchText, isInspection, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
    const pagedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return processedData.slice(start, start + pageSize);
    }, [processedData, currentPage]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const sortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    const showFilterBar = classOptions.length > 0 || roomOptions.length > 0 || isInspection || isLeaveList || isStudentList || isRoomList || isRoomRequestList || isAccessList || isOverdueList;

    const renderFilterBar = () => (
        <div className="border rounded-3 p-3 mb-3 bg-light-subtle">
            <div className="d-flex gap-2 flex-wrap align-items-center">
                <input
                    className="form-control form-control-sm"
                    style={{ maxWidth: 240 }}
                    value={searchText}
                    onChange={(event) => {
                        setSearchText(event.target.value);
                        setCurrentPage(1);
                    }}
                    placeholder="Tìm kiếm..."
                />
                {classOptions.length > 0 && (
                    <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={classFilter} onChange={(event) => {
                        setClassFilter(event.target.value);
                        setCurrentPage(1);
                    }}>
                        <option value="">Tất cả lớp</option>
                        {classOptions.map((item) => (
                            <option key={item} value={item}>{item}</option>
                        ))}
                    </select>
                )}
                {roomOptions.length > 0 && (
                    <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={roomFilter} onChange={(event) => {
                        setRoomFilter(event.target.value);
                        setCurrentPage(1);
                    }}>
                        <option value="">Tất cả phòng</option>
                        {roomOptions.map((item) => (
                            <option key={item} value={item}>{item}</option>
                        ))}
                    </select>
                )}
                {isInspection && criteriaList.length > 0 && (
                    <select className="form-select form-select-sm" style={{ maxWidth: 220 }} value={filterCriteria} onChange={(event) => {
                        setFilterCriteria(event.target.value);
                        setCurrentPage(1);
                    }}>
                        <option value="">Tất cả tiêu chí</option>
                        {criteriaList.map((item) => (
                            <option key={item} value={item}>{item}</option>
                        ))}
                    </select>
                )}
                <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => {
                        setSearchText('');
                        setClassFilter('');
                        setRoomFilter('');
                        setFilterCriteria('');
                        setCurrentPage(1);
                    }}
                >
                    Xóa lọc
                </button>
            </div>
            <div className="small text-muted mt-2">
                Hiển thị {processedData.length} / {rows.length} dòng
            </div>
        </div>
    );

    const renderPagination = () => {
        if (processedData.length <= pageSize) return null;
        const startRow = (currentPage - 1) * pageSize + 1;
        const endRow = Math.min(currentPage * pageSize, processedData.length);

        return (
            <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                <div className="small text-muted">
                    Dòng {startRow}-{endRow} / {processedData.length}
                </div>
                <div className="btn-group btn-group-sm">
                    <button type="button" className="btn btn-outline-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>Đầu</button>
                    <button type="button" className="btn btn-outline-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Trước</button>
                    <button type="button" className="btn btn-light" disabled>{currentPage}/{totalPages}</button>
                    <button type="button" className="btn btn-outline-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Sau</button>
                    <button type="button" className="btn btn-outline-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>Cuối</button>
                </div>
            </div>
        );
    };

    const renderInspectionTable = () => {
        const showRoomColumn = role !== 'student' && processedData.some((row) => row.id_dormroom || row.room_id || row.room_name);
        const showDateColumn = processedData.some((row) => row.inspection_date);

        return (
            <>
                {showFilterBar && renderFilterBar()}
                <div className="table-responsive border rounded-3 overflow-hidden">
                    <table className="table table-hover table-striped align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                {showRoomColumn && <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id_dormroom')}>Phòng {sortIcon('id_dormroom')}</th>}
                                {showDateColumn && <th style={{ cursor: 'pointer' }} onClick={() => handleSort('inspection_date')}>Ngày {sortIcon('inspection_date')}</th>}
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('student_name')}>Học sinh {sortIcon('student_name')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('criteria_name')}>Tiêu chí {sortIcon('criteria_name')}</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('penalty_points')}>Điểm trừ {sortIcon('penalty_points')}</th>
                                <th>Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedData.map((row, index) => (
                                <tr key={`${row.id_dormroom || row.room_id || 'room'}-${row.criteria_name || 'criteria'}-${index}`}>
                                    {showRoomColumn && <td className="fw-semibold">{row.id_dormroom || row.room_id || row.room_name}</td>}
                                    {showDateColumn && <td>{row.inspection_date}</td>}
                                    <td>{row.student_name || 'Cả phòng'}</td>
                                    <td>{row.criteria_name}</td>
                                    <td><span className="badge bg-danger-subtle text-danger">-{Number(row.penalty_points || 0)}</span></td>
                                    <td>{row.note || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {renderPagination()}
            </>
        );
    };

    const renderStudentTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id')}>Mã HS {sortIcon('id')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Họ tên {sortIcon('name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('class_name')}>Lớp {sortIcon('class_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Phòng {sortIcon('room_name')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.id}-${index}`}>
                                <td className="text-nowrap">{row.id}</td>
                                <td className="fw-semibold">{row.name}</td>
                                <td>{row.class_name || '-'}</td>
                                <td>{row.room_name || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

const renderStatusBadge = (teacherAccept, managerAccept) => {
    if (teacherAccept === 'DENIED' || managerAccept === 'DENIED') {
        return <span className="badge bg-danger">Bị từ chối</span>;
    }
    if (teacherAccept === 'ACCEPTED' && managerAccept === 'ACCEPTED') {
        return <span className="badge bg-success">Được duyệt</span>;
    }
    if (teacherAccept === 'PENDING') {
        return <span className="badge bg-warning text-dark">Chờ giáo viên duyệt</span>;
    }
    if (teacherAccept === 'ACCEPTED' && managerAccept === 'PENDING') {
        return <span className="badge bg-warning text-dark">Chờ quản lý duyệt</span>;
    }
    return <span className="badge bg-secondary">Đang chờ duyệt</span>;
};

    const renderLeaveTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('student_name')}>Học sinh {sortIcon('student_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('class_name')}>Lớp {sortIcon('class_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Phòng {sortIcon('room_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('leave_type')}>Loại phép {sortIcon('leave_type')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('start_time')}>Thời gian {sortIcon('start_time')}</th>
                            <th>Lý do</th>
                            <th>Trạng thái</th>
                            {isPendingLeaves && <th>Thao tác</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.id || row.id_student}-${index}`}>
                                <td className="fw-semibold">{row.student_name}</td>
                                <td>{row.class_name || '-'}</td>
                                <td>{row.room_name || '-'}</td>
                                <td><span className="badge bg-primary-subtle text-primary">{leaveTypeText[row.leave_type] || row.leave_type}</span></td>
                                <td className="small">{`${String(row.start_time || '').slice(0, 16)} - ${String(row.end_time || '').slice(0, 16)}`}</td>
                                <td>{row.reason || '-'}</td>
                                <td>{renderStatusBadge(row.teacher_accept, row.manager_accept)}</td>
                                {isPendingLeaves && (
                                    <td>
                                        <div className="d-flex gap-2 flex-wrap">
                                            <button type="button" className="btn btn-sm btn-success" onClick={() => handleLeaveAction(row, 'accept')}>Đồng ý</button>
                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => handleLeaveAction(row, 'deny')}>Từ chối</button>
                                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleLeaveAction(row, 'delete')}>Xóa</button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

    const renderRoomTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_id')}>Phòng {sortIcon('room_id')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Tên phòng {sortIcon('room_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('inspection_date')}>Ngày {sortIcon('inspection_date')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('violation_count')}>Số lỗi {sortIcon('violation_count')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('total_penalty')}>Tổng điểm trừ {sortIcon('total_penalty')}</th>
                            <th>Ghi chú</th>
                            {type === 'not_inspected_rooms' && <th>Thao tác</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.room_id || row.id_dormroom}-${index}`}>
                                <td className="fw-semibold">{row.room_id || row.id_dormroom}</td>
                                <td>{row.room_name || '-'}</td>
                                <td>{row.inspection_date || '-'}</td>
                                <td><span className="badge bg-warning-subtle text-dark">{row.violation_count ?? '-'}</span></td>
                                <td><span className="badge bg-danger-subtle text-danger">{row.total_penalty ?? '-'}</span></td>
                                <td>{row.note || '-'}</td>
                                {type === 'not_inspected_rooms' && (
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-primary"
                                            onClick={() => onInspectRoom?.(row.room_id || row.id_dormroom)}
                                        >
                                            Kiểm tra phòng
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

    const renderRoomRequestTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>Thời gian {sortIcon('created_at')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('teacher_name')}>Giáo viên {sortIcon('teacher_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('student_name')}>Học sinh {sortIcon('student_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('class_name')}>Lớp {sortIcon('class_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Phòng {sortIcon('room_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('action')}>Hành động {sortIcon('action')}</th>
                            {isPendingRoomRequests && <th>Thao tác</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.id}-${index}`}>
                                <td>{row.created_at || '-'}</td>
                                <td>{row.teacher_name || '-'}</td>
                                <td className="fw-semibold">{row.student_name || row.id_student}</td>
                                <td>{row.class_name || '-'}</td>
                                <td>{row.room_name || '-'}</td>
                                <td>
                                    <span className={`badge ${row.action === 'ADD' ? 'bg-success' : 'bg-danger'}`}>
                                        {row.action === 'ADD' ? 'Thêm vào phòng' : 'Xoá khỏi phòng'}
                                    </span>
                                </td>
                                {isPendingRoomRequests && (
                                    <td>
                                        <div className="d-flex gap-2 flex-wrap">
                                            <button type="button" className="btn btn-sm btn-success" onClick={() => handleRoomRequestAction(row, 'APPROVED')}>
                                                Duyệt
                                            </button>
                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => handleRoomRequestAction(row, 'REJECTED')}>
                                                Từ chối
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

    const renderAccessTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('access_time')}>Thời gian {sortIcon('access_time')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('student_name')}>Học sinh {sortIcon('student_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('class_name')}>Lớp {sortIcon('class_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Phòng {sortIcon('room_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>Loại {sortIcon('type')}</th>
                            <th>Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.id || row.id_student}-${index}`}>
                                <td>{row.access_time || '-'}</td>
                                <td className="fw-semibold">{row.student_name || row.id_student}</td>
                                <td>{row.class_name || '-'}</td>
                                <td>{row.room_name || '-'}</td>
                                <td>
                                    <span className={`badge ${row.type === 'IN' ? 'bg-success' : row.type === 'OUT' ? 'bg-danger' : 'bg-secondary'}`}>
                                        {row.type === 'IN' ? 'VÀO' : row.type === 'OUT' ? 'RA' : row.type}
                                    </span>
                                </td>
                                <td>{row.note || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

    const renderOverdueTable = () => (
        <>
            {showFilterBar && renderFilterBar()}
            <div className="table-responsive border rounded-3 overflow-hidden">
                <table className="table table-hover table-striped align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id')}>Mã HS {sortIcon('id')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Họ tên {sortIcon('name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('class_name')}>Lớp {sortIcon('class_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('room_name')}>Phòng {sortIcon('room_name')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('leave_type')}>Loại phép {sortIcon('leave_type')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('exit_time')}>Giờ ra {sortIcon('exit_time')}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('end_time')}>Hạn vào {sortIcon('end_time')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedData.map((row, index) => (
                            <tr key={`${row.id}-${index}`}>
                                <td>{row.id}</td>
                                <td className="fw-semibold text-danger">{row.name}</td>
                                <td>{row.class_name || '-'}</td>
                                <td>{row.room_name || '-'}</td>
                                <td><span className="badge bg-warning text-dark">{leaveTypeText[row.leave_type] || row.leave_type}</span></td>
                                <td className="small text-muted">{String(row.exit_time || '').slice(0, 16)}</td>
                                <td className="small fw-semibold text-danger">{String(row.end_time || '').slice(0, 16)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {renderPagination()}
        </>
    );

    const renderContent = () => {
        if (!processedData.length) {
            return <div className="text-center py-4 text-muted">Không có dữ liệu chi tiết</div>;
        }
        if (isInspection) return renderInspectionTable();
        if (isStudentList) return renderStudentTable();
        if (isLeaveList) return renderLeaveTable();
        if (isRoomList) return renderRoomTable();
        if (isRoomRequestList) return renderRoomRequestTable();
        if (isAccessList) return renderAccessTable();
        if (isOverdueList) return renderOverdueTable();
        return <div className="text-center py-4 text-muted">Chưa có cấu hình hiển thị cho loại dữ liệu này</div>;
    };

    return (
        <>
            <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                    <div className="modal-content border-0 shadow-lg">
                        <div className="modal-header">
                            <h5 className="modal-title fw-bold">{title}</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body p-4">
                            {renderContent()}
                        </div>
                    </div>
                </div>
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
        </>
    );
};

export default DashboardDetailModal;
