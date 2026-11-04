import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import { useMockToday } from '../../hooks/useMockToday';
import ConfirmModal from '../common/ConfirmModal';
import DateRangePicker from '../common/DateRangePicker';
import WeeklyMenu from './WeeklyMenu';
import MealStats from './MealStats';

const API_MEAL = apiUrl('/api/meal');
const API_STUDENT = apiUrl('/api/student');
const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };

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

const MealManager = () => {
    const user = getStoredUser() || {};
    let roleName = user.role_name || roleMap[user.role_id] || '';
    if (user?.username === 'admin' || roleName === 'admin' || roleName === 'administrator') {
        roleName = 'manager';
    }

    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') || 'attendance';
    const [activeTab, setActiveTab] = useState(tabParam);

    const mockToday = useMockToday();  // YYYY-MM-DD từ backend
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [isEditing, setIsEditing] = useState(false);

    const [classes, setClasses] = useState([]);
    const [className, setClassName] = useState('');
    const [days, setDays] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));

    const canViewStats = ['canteen_manager', 'manager', 'admin'].includes(roleName);

    useEffect(() => {
        const currentParam = searchParams.get('tab');
        if (currentParam && ['attendance', 'menu', 'stats'].includes(currentParam)) {
            setActiveTab(currentParam);
        }
    }, [searchParams]);

    const handleTabChange = (tabKey) => {
        setActiveTab(tabKey);
        setSearchParams({ tab: tabKey });
    };

    // Đồng bộ dateRange khi mockToday load xong
    useEffect(() => {
        if (mockToday) {
            const [y, m, d] = mockToday.split('-').map(Number);
            const first = new Date(y, m - 1, 1);
            const last = new Date(y, m, 0);
            const pad = (n) => String(n).padStart(2, '0');
            const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
            setDateRange({ start: fmt(first), end: fmt(last) });
        }
    }, [mockToday]);

    const isCellEditable = (studentId) => {
        if (!isEditing) return false;
        if (roleName === 'manager' || roleName === 'canteen_manager') return true;
        if (roleName === 'teacher') return true;
        if (roleName === 'student' && studentId === user.username) return true;
        return false;
    };

    const handleCellClick = (student, day, mealType, isCut) => {
        const actionText = isCut ? 'Đăng ký ăn cơm' : 'Cắt cơm';
        showConfirm(
            'Xác nhận báo cơm',
            `Bạn có chắc chắn muốn thay đổi trạng thái sang ${actionText.toUpperCase()} cho học sinh ${student.name} ngày ${day.split('-').reverse().join('/')} (${mealType === 'LUNCH' ? 'Trưa' : 'Tối'}) không?`,
            () => {
                fetch(`${API_MEAL}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: user.username,
                        role_name: roleName,
                        student_id: student.id_VNeID,
                        meal_date: day,
                        meal_type: mealType,
                        is_cut: !isCut
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            closeConfirm();
                            fetchRows();
                        } else {
                            showConfirm('Không thể cập nhật', data.message || 'Có lỗi xảy ra khi cập nhật.', closeConfirm, 'error');
                        }
                    })
                    .catch(() => {
                        showConfirm('Lỗi kết nối', 'Lỗi kết nối đến máy chủ.', closeConfirm, 'error');
                    });
            }
        );
    };

    useEffect(() => {
        const params = new URLSearchParams();
        if (roleName === 'teacher' && user.username) params.set('teacher_id', user.username);
        const url = params.toString() ? `${API_STUDENT}/classes?${params.toString()}` : `${API_STUDENT}/classes`;
        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;
                const classList = data.data.flatMap(group => group.classes || []);
                setClasses(classList);
                if (classList.length > 0) setClassName(classList[0]);
            })
            .catch(console.error);
    }, []);

    const fetchRows = () => {
        if (!dateRange.start || !dateRange.end) return;
        setLoading(true);
        const params = new URLSearchParams({
            start_date: dateRange.start,
            end_date: dateRange.end,
            username: user.username || '',
            role_name: roleName
        });
        if (roleName !== 'student' && className) params.set('class_name', className);

        fetch(`${API_MEAL}/monthly?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setDays(data.data.days);
                    const sorted = (data.data.students || []).sort(sortViName);
                    setStudents(sorted);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (activeTab === 'attendance' && dateRange.start && dateRange.end && (roleName === 'student' || className)) {
            fetchRows();
        }
    }, [activeTab, dateRange, className]);

    return (
        <div style={{ padding: '20px' }}>
            <style>{`
                @media (max-width: 576px) {
                    .meal-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
                    .meal-controls { width: 100% !important; flex-wrap: wrap !important; }
                    .meal-control { width: 100% !important; }
                    .meal-header .form-select,
                    .meal-header .form-control { width: 100% !important; max-width: 100% !important; min-width: unset !important; }
                }
                .meal-controls {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: nowrap;
                }
                .meal-control {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                }
                .meal-control-label {
                    font-size: 0.875rem;
                    font-weight: 700;
                    color: #4b5563;
                    white-space: nowrap;
                }
                .meal-class-text {
                    min-width: 160px;
                    height: 38px;
                    display: inline-flex;
                    align-items: center;
                    padding: 0 12px;
                    border: 1px solid #ced4da;
                    border-radius: 6px;
                    background: #f8f9fa;
                    color: #212529;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .meal-cell-editable {
                    transition: background-color 0.15s;
                }
                .meal-cell-editable:hover {
                    background-color: #e8f0fe !important;
                }
                .meal-table-scroll {
                    max-height: calc(100vh - 240px);
                    min-height: 260px;
                    overflow: auto;
                }
                .meal-table-scroll thead th {
                    position: sticky;
                    top: 0;
                    z-index: 2;
                    background: #f8f9fa;
                }
                .meal-table-scroll thead tr:nth-child(2) th {
                    top: 33px;
                }
                .meal-nav-tabs .nav-link {
                    font-weight: 600;
                    color: #4b5563;
                    border: none;
                    border-bottom: 3px solid transparent;
                    padding: 10px 18px;
                    border-radius: 0;
                    transition: all 0.2s;
                }
                .meal-nav-tabs .nav-link.active {
                    color: #00206d;
                    border-bottom-color: #00206d;
                    background: transparent;
                }
                .meal-nav-tabs .nav-link:hover:not(.active) {
                    color: #00206d;
                    border-bottom-color: #d1d5db;
                }
            `}</style>

            {/* Tiêu đề & Tab Navigation */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3">
                <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>
                    Quản lý Nhà ăn & Chấm cơm
                </h2>
            </div>

            {/* Tab Pills */}
            <ul className="nav nav-tabs meal-nav-tabs mb-4 bg-white px-3 pt-2 rounded shadow-sm border-0">
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'attendance' ? 'active' : ''}`}
                        onClick={() => handleTabChange('attendance')}
                    >
                        <i className="fas fa-check-circle me-2"></i> Bảng chấm cơm
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'menu' ? 'active' : ''}`}
                        onClick={() => handleTabChange('menu')}
                    >
                        <i className="fas fa-utensils me-2"></i> Thực đơn tuần
                    </button>
                </li>
                {canViewStats && (
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'stats' ? 'active' : ''}`}
                            onClick={() => handleTabChange('stats')}
                        >
                            <i className="fas fa-chart-pie me-2"></i> Thống kê suất ăn
                        </button>
                    </li>
                )}
            </ul>

            {/* TAB 1: BẢNG CHẤM CƠM */}
            {activeTab === 'attendance' && (
                <div>
                    <div className="meal-header d-flex justify-content-between align-items-center mb-3 gap-3 flex-wrap">
                        <h4 className="fw-bold text-dark m-0">Danh sách chấm cơm học sinh</h4>
                        <div className="meal-controls">
                            {roleName !== 'student' && (
                                <div className="meal-control">
                                    <span className="meal-control-label">Lớp</span>
                                    {roleName === 'teacher' ? (
                                        <span className="meal-class-text">{className ? `Lớp ${className}` : 'Chưa có lớp'}</span>
                                    ) : (
                                        <select className="form-select" value={className} onChange={(e) => setClassName(e.target.value)} style={{ minWidth: '160px' }}>
                                            {classes.map(item => <option key={item} value={item}>Lớp {item}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}
                            <div className="meal-control">
                                <span className="meal-control-label">Chọn ngày</span>
                                <DateRangePicker
                                    startDate={dateRange.start}
                                    endDate={dateRange.end}
                                    onChange={(start, end) => setDateRange({ start, end })}
                                    placeholder="Chọn khoảng ngày"
                                    align="right"
                                />
                            </div>
                            <button
                                className="btn btn-outline-success"
                                onClick={() => {
                                    const params = new URLSearchParams({
                                        username: user.username || '',
                                        role_name: roleName,
                                        ...(className ? { class_name: className } : {}),
                                        ...(dateRange.start ? { start_date: dateRange.start } : {}),
                                        ...(dateRange.end ? { end_date: dateRange.end } : {})
                                    });
                                    window.location.href = `${API_MEAL}/export?${params.toString()}`;
                                }}
                                style={{ height: '38px', whiteSpace: 'nowrap', fontWeight: 600 }}
                                title="Xuất báo cáo ăn cơm ra file Excel"
                            >
                                <i className="fas fa-file-excel me-1"></i> Xuất Excel
                            </button>
                            {['student', 'teacher', 'manager', 'canteen_manager'].includes(roleName) && (
                                <button
                                    className={`btn ${isEditing ? 'btn-warning' : 'btn-outline-primary'}`}
                                    onClick={() => setIsEditing(!isEditing)}
                                    style={{ height: '38px', whiteSpace: 'nowrap', fontWeight: 600 }}
                                >
                                    {isEditing ? 'Hủy chỉnh sửa' : 'Chỉnh sửa'}
                                </button>
                            )}
                        </div>
                    </div>
                    {isEditing && (
                        <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center gap-2 shadow-sm" style={{ fontSize: '0.88rem', borderRadius: '6px' }}>
                            <span style={{ fontSize: '1.1rem' }}>💡</span>
                            <span><strong>Chế độ chỉnh sửa đang hoạt động:</strong> Nhấp vào các ô trong bảng để chuyển đổi giữa có ăn (<strong>X</strong>) và cắt cơm (<strong>O</strong>).</span>
                        </div>
                    )}
                    <div className="bg-white rounded p-4 shadow-sm">
                        <div className="meal-table-scroll">
                            <table className="table table-bordered table-sm align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th rowSpan="2" style={{ minWidth: '220px' }}>Học sinh</th>
                                        <th rowSpan="2">Lớp</th>
                                        {days.map(day => (
                                            <th key={day} colSpan="2" className="text-center">{day.slice(8, 10)}</th>
                                        ))}
                                    </tr>
                                    <tr>
                                        {days.map(day => (
                                            <Fragment key={day}>
                                                <th className="text-center">Tr</th>
                                                <th className="text-center">T</th>
                                            </Fragment>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={2 + days.length * 2} className="text-center">Đang tải dữ liệu...</td></tr>
                                    ) : students.map(student => (
                                        <tr key={student.id_VNeID}>
                                            <td>{student.name}<div className="small text-muted">{student.id_VNeID}</div></td>
                                            <td>{student.class_name || '-'}</td>
                                            {days.map(day => {
                                                const meal = student.meals?.[day] || {};
                                                const editable = isCellEditable(student.id_VNeID);
                                                return (
                                                    <Fragment key={day}>
                                                        <td
                                                            className={`text-center fw-bold ${meal.lunch_cut ? 'table-danger text-danger' : 'text-success'} ${editable ? 'meal-cell-editable' : ''}`}
                                                            title={meal.lunch_note || (meal.lunch_cut ? 'Cắt cơm' : 'Ăn cơm')}
                                                            style={{ cursor: editable ? 'pointer' : 'default', fontSize: '0.95rem' }}
                                                            onClick={() => editable && handleCellClick(student, day, 'LUNCH', meal.lunch_cut)}
                                                        >
                                                            {meal.lunch_cut ? 'O' : 'X'}
                                                        </td>
                                                        <td
                                                            className={`text-center fw-bold ${meal.dinner_cut ? 'table-danger text-danger' : 'text-success'} ${editable ? 'meal-cell-editable' : ''}`}
                                                            title={meal.dinner_note || (meal.dinner_cut ? 'Cắt cơm' : 'Ăn cơm')}
                                                            style={{ cursor: editable ? 'pointer' : 'default', fontSize: '0.95rem' }}
                                                            onClick={() => editable && handleCellClick(student, day, 'DINNER', meal.dinner_cut)}
                                                        >
                                                            {meal.dinner_cut ? 'O' : 'X'}
                                                        </td>
                                                    </Fragment>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {!loading && students.length === 0 && (
                                        <tr><td colSpan={2 + days.length * 2} className="text-center">Không có dữ liệu</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="small text-muted mt-2">
                            <strong>Quy ước chấm cơm:</strong> Tr: cơm trưa, T: cơm tối. Dấu <strong className="text-success">X</strong> là bữa có đăng ký ăn cơm ở trường. Dấu <strong className="text-danger">O</strong> là bữa bị cắt cơm (không ăn). Nhấp vào ô để thay đổi trạng thái nếu ở chế độ chỉnh sửa.
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: THỰC ĐƠN TUẦN */}
            {activeTab === 'menu' && (
                <WeeklyMenu
                    user={user}
                    roleName={roleName}
                    mockToday={mockToday}
                    showConfirm={showConfirm}
                    closeConfirm={closeConfirm}
                />
            )}

            {/* TAB 3: THỐNG KÊ SUẤT ĂN */}
            {activeTab === 'stats' && canViewStats && (
                <MealStats
                    user={user}
                    roleName={roleName}
                    mockToday={mockToday}
                />
            )}

            <ConfirmModal
                show={confirmModal.show}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirm}
            />
        </div>
    );
};

export default MealManager;
