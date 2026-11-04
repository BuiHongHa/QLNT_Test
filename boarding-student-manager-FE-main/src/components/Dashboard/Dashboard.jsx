import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout/Layout';
import './Dashboard.css';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import DashboardDetailModal from './DashboardDetailModal';

const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };
const roleLabelMap = {
    teacher: 'Giáo viên',
    manager: 'Ban Giám Hiệu',
    dorm_manager: 'Quản lý KTX',
    canteen_manager: 'Quản lý Nhà ăn',
    student: 'Học sinh',
};

const leaveTypeLabel = {
    AFTER_SCHOOL: 'Ra sau giờ học',
    EMERGENCY: 'Đột xuất',
    REGULAR_WEEKEND: 'Thường xuyên',
};

const emptyDetailModal = { show: false, title: '', type: '', data: [] };

const Dashboard = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [roleName, setRoleName] = useState('');
    const [stats, setStats] = useState(null);
    const [inspStats, setInspStats] = useState(null);
    const [clock, setClock] = useState(new Date());
    const [mockNow, setMockNow] = useState(null);
    const [detailModal, setDetailModal] = useState(emptyDetailModal);
    const [approvalNotice, setApprovalNotice] = useState({ total: 0, items: [] });

    const closeDetails = () => setDetailModal(emptyDetailModal);

    const openFetchDetails = (title, type) => {
        fetch(apiUrl(`/api/dashboard/details?type=${type}&username=${encodeURIComponent(user?.username || '')}&role_name=${encodeURIComponent(roleName)}`))
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    setDetailModal({ show: true, title, type, data: data.data || [] });
                }
            })
            .catch(console.error);
    };

    const openRoomRequestDetails = () => {
        fetch(apiUrl('/api/dormroom/requests?status=PENDING'))
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    setDetailModal({
                        show: true,
                        title: 'Danh sách yêu cầu chuyển phòng cần duyệt',
                        type: 'room_change_requests',
                        data: data.data || [],
                    });
                }
            })
            .catch(console.error);
    };

    const openInspectionDetails = (title, filterKey) => {
        const details = filterKey === 'week' ? inspStats?.week_details : inspStats?.today_details;
        setDetailModal({ show: true, title, type: 'inspection', data: details || [] });
    };

    useEffect(() => {
        const parsed = getStoredUser();
        if (parsed) {
            setUser(parsed);
            setRoleName(parsed.role_name || roleMap[parsed.role_id] || '');
        }

        const fetchMockTime = () => {
            fetch(apiUrl('/api/debug/mock-time'))
                .then((response) => response.json())
                .then((data) => {
                    if (data.mock_active && data.effective_now) {
                        setMockNow(new Date(data.effective_now.replace(' ', 'T')));
                    } else {
                        setMockNow(null);
                    }
                })
                .catch(() => setMockNow(null));
        };

        fetchMockTime();

        const timer = setInterval(() => {
            setClock(new Date());
            fetchMockTime();
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const fetchDashboardData = () => {
        if (!user || !roleName || !['manager', 'teacher', 'student', 'dorm_manager', 'canteen_manager'].includes(roleName)) {
            return;
        }
        fetch(apiUrl(`/api/dashboard/stats?username=${encodeURIComponent(user.username || '')}&role_name=${encodeURIComponent(roleName)}`))
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    const nextStats = data.data;
                    setStats(nextStats);

                    const nextItems = [];
                    const pendingLeaves = nextStats?.pending_leaves || 0;
                    if (pendingLeaves > 0 && ['manager', 'teacher'].includes(roleName)) {
                        nextItems.push({
                            key: 'pending_leaves',
                            label: 'Phiếu nghỉ phép cần duyệt',
                            count: pendingLeaves,
                            action: () => openFetchDetails('Danh sách phiếu cần duyệt', 'pending_leaves'),
                        });
                    }
                    if (roleName === 'dorm_manager') {
                        const pendingAfterSchool = nextStats?.pending_after_school || 0;
                        if (pendingAfterSchool > 0) {
                            nextItems.push({
                                key: 'pending_after_school',
                                label: 'Đơn ra ngoài sau giờ học cần duyệt',
                                count: pendingAfterSchool,
                                action: () => navigate('/leave'),
                            });
                        }
                    }

                    if (roleName === 'manager' || roleName === 'dorm_manager') {
                        fetch(apiUrl('/api/dormroom/requests'))
                            .then((response) => response.json())
                            .then((requestData) => {
                                const pendingRoomRequests = (requestData.data || []).filter((item) => item.status === 'PENDING').length;
                                const combinedItems = [...nextItems];
                                if (pendingRoomRequests > 0) {
                                    combinedItems.push({
                                        key: 'pending_room_requests',
                                        label: 'Yêu cầu chuyển phòng cần duyệt',
                                        count: pendingRoomRequests,
                                        action: openRoomRequestDetails,
                                    });
                                }
                                setApprovalNotice({
                                    total: combinedItems.reduce((sum, item) => sum + item.count, 0),
                                    items: combinedItems,
                                });
                            })
                            .catch(() => {
                                setApprovalNotice({
                                    total: nextItems.reduce((sum, item) => sum + item.count, 0),
                                    items: nextItems,
                                });
                            });
                    } else {
                        setApprovalNotice({
                            total: nextItems.reduce((sum, item) => sum + item.count, 0),
                            items: nextItems,
                        });
                    }
                }
            })
            .catch(console.error);

        if (['manager', 'teacher', 'student', 'dorm_manager'].includes(roleName)) {
            fetch(apiUrl(`/api/inspection/dashboard-stats?username=${encodeURIComponent(user.username || '')}&role_name=${encodeURIComponent(roleName)}`))
                .then((response) => response.json())
                .then((data) => {
                    if (data.success) setInspStats(data.data);
                })
                .catch(console.error);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [user, roleName]);

    const handleInspectRoom = (roomId) => {
        if (!roomId) return;
        closeDetails();
        navigate(`/inspection?room=${encodeURIComponent(roomId)}`);
    };

    const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const pad = (value) => String(value).padStart(2, '0');

    const displayDate = mockNow || clock;
    const clockDate = `${weekdays[displayDate.getDay()]}, ngày ${pad(displayDate.getDate())}/${pad(displayDate.getMonth() + 1)}/${displayDate.getFullYear()}`;
    const clockTime = `${pad(displayDate.getHours())}:${pad(displayDate.getMinutes())}:${pad(displayDate.getSeconds())}`;
    const roleLabel = user?.role_label || roleLabelMap[roleName] || 'Người dùng';

    const renderManagerDashboard = () => {
        if (!stats) return <div className="text-center py-4 text-muted">Đang tải thống kê...</div>;
        const outside = stats.students_outside_today || {};

        return (
            <>
                <div className="dashboard-overview">
                    <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Danh sách học sinh nội trú', 'total_students')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Tổng học sinh nội trú</span>
                            <span className="stat-card-value">{stats.total_students || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-user-graduate"></i>
                        </div>
                    </div>

                    <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phiếu nghỉ phép trong tuần', 'leave_requests_this_week')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Nghỉ phép trong tuần</span>
                            <span className="stat-card-value">{stats.leave_requests_this_week || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-calendar-week"></i>
                        </div>
                    </div>

                    <div className="stat-card green" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Danh sách phiếu đã duyệt', 'approved_leaves')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phiếu đã duyệt</span>
                            <span className="stat-card-value">{stats.approved_leaves || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-check-circle"></i>
                        </div>
                    </div>
                </div>

                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-clipboard-check me-2"></i>
                    Kiểm tra phòng ở trong ngày
                </div>
                <div className="dashboard-overview">
                    <div className="stat-card green" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phòng đã kiểm tra trong ngày', 'inspected_rooms')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phòng đã kiểm tra</span>
                            <span className="stat-card-value">{inspStats?.inspected_today || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-check-double"></i></div>
                    </div>
                    <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phòng chưa kiểm tra trong ngày', 'not_inspected_rooms')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phòng chưa kiểm tra</span>
                            <span className="stat-card-value">{inspStats?.not_inspected_today || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-exclamation-triangle"></i></div>
                    </div>
                    <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phòng lỗi nặng trong ngày', 'heavy_rooms')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phòng lỗi nặng</span>
                            <span className="stat-card-value">{inspStats?.heavy_rooms || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-times-circle"></i></div>
                    </div>
                </div>

                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-sign-out-alt me-2"></i>
                    Học sinh ra ngoài trong ngày
                    <span className="badge bg-primary ms-2">{stats.students_outside_total || 0}</span>
                </div>
                <div className="dashboard-overview outside-cards">
                    {Object.entries(leaveTypeLabel).map(([type, label]) => (
                        <button
                            type="button"
                            className={`outside-card ${type.toLowerCase()}`}
                            key={type}
                            onClick={() => openFetchDetails(`Danh sách học sinh ra ngoài - ${label}`, `outside_today_${type.toLowerCase()}`)}
                        >
                            <div className="outside-card-value">{outside[type] || 0}</div>
                            <div className="outside-card-label">{label}</div>
                        </button>
                    ))}
                </div>
            </>
        );
    };

    const renderTeacherDashboard = () => {
        if (!stats) return <div className="text-center py-4 text-muted">Đang tải thống kê...</div>;
        const outside = stats.students_outside_today || {};

        return (
            <>
                <div className="dashboard-overview">
                    <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Học sinh đăng ký ra sau giờ học', 'leave_requests_after_school')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Nghỉ sau giờ học</span>
                            <span className="stat-card-value">{stats.leave_requests_after_school || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-walking"></i>
                        </div>
                    </div>

                    <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Nghỉ phép cuối tuần', 'regular_leave_requests')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Nghỉ phép cuối tuần</span>
                            <span className="stat-card-value">{stats.regular_leave_requests || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-home"></i>
                        </div>
                    </div>

                    <div className="stat-card purple" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Học sinh đăng ký đột xuất', 'leave_requests_emergency')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Nghỉ đột xuất</span>
                            <span className="stat-card-value">{stats.leave_requests_emergency || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-exclamation-circle"></i>
                        </div>
                    </div>

                    <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Danh sách phiếu cần duyệt', 'pending_leaves')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phiếu cần duyệt</span>
                            <span className="stat-card-value">{stats.pending_leaves || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-clock"></i>
                        </div>
                    </div>
                </div>

                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-clipboard-list me-2"></i>
                    Kiểm tra phòng ở (lớp phụ trách)
                </div>
                <div className="dashboard-overview">
                    <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => openInspectionDetails('Chi tiết điểm trừ lớp (hôm nay)', 'today')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Điểm trừ hôm nay</span>
                            <span className="stat-card-value">{inspStats?.today_penalty || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-minus-circle"></i></div>
                    </div>
                    <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openInspectionDetails('Chi tiết điểm trừ lớp (tuần này)', 'week')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Điểm trừ tuần này</span>
                            <span className="stat-card-value">{inspStats?.week_penalty || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-calendar-minus"></i></div>
                    </div>
                </div>

                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-sign-out-alt me-2"></i>
                    Học sinh ra ngoài trường trong ngày
                    <span className="badge bg-primary ms-2">{stats.students_outside_total || 0}</span>
                </div>
                <div className="dashboard-overview outside-cards">
                    {Object.entries(leaveTypeLabel).map(([type, label]) => (
                        <button
                            type="button"
                            className={`outside-card ${type.toLowerCase()}`}
                            key={type}
                            onClick={() => openFetchDetails(`Danh sách học sinh ra ngoài - ${label}`, `outside_today_${type.toLowerCase()}`)}
                        >
                            <div className="outside-card-value">{outside[type] || 0}</div>
                            <div className="outside-card-label">{label}</div>
                        </button>
                    ))}
                </div>
            </>
        );
    };

    const renderStudentDashboard = () => {
        if (!stats) return <div className="text-center py-4 text-muted">Đang tải thống kê...</div>;

        return (
            <>
                <div className="dashboard-overview">
                    <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phiếu đã đăng ký trong tuần', 'student_leave_requests_this_week')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phiếu đã đăng ký (tuần)</span>
                            <span className="stat-card-value">{stats.leave_requests_this_week || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-file-signature"></i>
                        </div>
                    </div>

                    <div className="stat-card green" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phiếu đã đăng ký trong ngày', 'student_leave_requests_today')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phiếu đã đăng ký (ngày)</span>
                            <span className="stat-card-value">{stats.leave_requests_today || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-check-circle"></i>
                        </div>
                    </div>

                    <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => openFetchDetails('Phiếu chưa duyệt trong tuần', 'student_pending_leaves_this_week')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Phiếu chưa duyệt (tuần)</span>
                            <span className="stat-card-value">{stats.pending_leaves_this_week || 0}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-clock"></i>
                        </div>
                    </div>

                    <div className="stat-card orange" style={{ gridColumn: '1 / -1' }}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Trạng thái về phép thường xuyên</span>
                            <span className="stat-card-value" style={{ fontSize: '1.4rem' }}>{stats.regular_leave_status || 'Chưa đăng ký'}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className="fas fa-home"></i>
                        </div>
                    </div>

                    {stats.after_school_status && (
                        <div className="stat-card purple" style={{ gridColumn: '1 / -1' }}>
                            <div className="stat-card-info">
                                <span className="stat-card-title">Trạng thái đơn ra sau giờ học</span>
                                <span className="stat-card-value" style={{ fontSize: '1.25rem' }}>{stats.after_school_status}</span>
                            </div>
                            <div className="stat-card-icon">
                                <i className="fas fa-walking"></i>
                            </div>
                        </div>
                    )}

                    {stats.emergency_status && (
                        <div className="stat-card red" style={{ gridColumn: '1 / -1' }}>
                            <div className="stat-card-info">
                                <span className="stat-card-title">Trạng thái đơn nghỉ đột xuất</span>
                                <span className="stat-card-value" style={{ fontSize: '1.25rem' }}>{stats.emergency_status}</span>
                            </div>
                            <div className="stat-card-icon">
                                <i className="fas fa-exclamation-circle"></i>
                            </div>
                        </div>
                    )}
                </div>

                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-door-open me-2"></i>
                    Điểm trừ phòng ({inspStats?.room_id || 'Chưa có phòng'})
                </div>
                <div className="dashboard-overview">
                    <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => openInspectionDetails('Chi tiết lỗi phòng (hôm nay)', 'today')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Hôm nay</span>
                            <span className="stat-card-value">{inspStats?.today_penalty || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-minus-circle"></i></div>
                    </div>
                    <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openInspectionDetails('Chi tiết lỗi phòng (tuần này)', 'week')}>
                        <div className="stat-card-info">
                            <span className="stat-card-title">Tuần này</span>
                            <span className="stat-card-value">{inspStats?.week_penalty || 0}</span>
                        </div>
                        <div className="stat-card-icon"><i className="fas fa-calendar-minus"></i></div>
                    </div>
                </div>
            </>
        );
    };

    const renderDormManagerDashboard = () => {
        if (!stats) return <div className="text-center py-4 text-muted">Đang tải thống kê...</div>;

        const dormCards = [
            { key: 'total_rooms', title: 'Tổng số phòng KTX', value: stats.total_rooms || 0, icon: 'fas fa-door-closed', color: 'blue' },
            { key: 'dorm_students', title: 'Học sinh đang ở KTX', value: stats.dorm_students || 0, icon: 'fas fa-users', color: 'green' },
            { key: 'pending_after_school', title: 'Đơn ra ngoài cần duyệt', value: stats.pending_after_school || 0, icon: 'fas fa-clock', color: 'red' },
        ];

        const todayCards = [
            { key: 'guard_out_today', title: 'Lượt ra cổng hôm nay', value: stats.out_today || 0, icon: 'fas fa-sign-out-alt', color: 'orange' },
            { key: 'guard_in_today', title: 'Lượt vào cổng hôm nay', value: stats.in_today || 0, icon: 'fas fa-sign-in-alt', color: 'green' },
            { key: 'guard_abnormal_today', title: 'Bất thường hôm nay', value: stats.abnormal_today || 0, icon: 'fas fa-exclamation-triangle', color: 'red' },
        ];

        const weekCards = [
            { key: 'guard_out_week', title: 'Lượt ra cổng trong tuần', value: stats.out_week || 0, icon: 'fas fa-calendar-minus', color: 'purple' },
            { key: 'guard_in_week', title: 'Lượt vào cổng trong tuần', value: stats.in_week || 0, icon: 'fas fa-calendar-check', color: 'blue' },
            { key: 'guard_abnormal_week', title: 'Bất thường trong tuần', value: stats.abnormal_week || 0, icon: 'fas fa-bell', color: 'red' },
        ];

        const renderCardRow = (cards) => (
            <div className="dashboard-overview">
                {cards.map((card) => (
                    <div
                        key={card.key}
                        className={`stat-card ${card.color}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                            if (card.key === 'pending_after_school') {
                                navigate('/leave');
                            } else if (card.key === 'total_rooms' || card.key === 'dorm_students') {
                                navigate('/dorm');
                            } else {
                                openFetchDetails(card.title, card.key);
                            }
                        }}
                    >
                        <div className="stat-card-info">
                            <span className="stat-card-title">{card.title}</span>
                            <span className="stat-card-value">{card.value}</span>
                        </div>
                        <div className="stat-card-icon">
                            <i className={card.icon}></i>
                        </div>
                    </div>
                ))}
            </div>
        );

        return (
            <>
                <div className="dashboard-section-title">
                    <i className="fas fa-hotel me-2"></i>
                    Quản lý Ký túc xá
                </div>
                {renderCardRow(dormCards)}
                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-door-open me-2"></i>
                    Thống kê ra/vào cổng hôm nay
                </div>
                {renderCardRow(todayCards)}
                <div className="dashboard-section-title mt-4">
                    <i className="fas fa-calendar-week me-2"></i>
                    Thống kê ra/vào cổng trong tuần
                </div>
                {renderCardRow(weekCards)}
            </>
        );
    };

    const renderCanteenManagerDashboard = () => {
        if (!stats) return <div className="text-center py-4 text-muted">Đang tải thống kê...</div>;

        const canteenCards = [
            { key: 'total_students', title: 'Tổng học sinh', value: stats.total_students || 0, icon: 'fas fa-users', color: 'blue', action: () => navigate('/meal') },
            { key: 'lunch_served_today', title: 'Suất trưa phục vụ', value: stats.lunch_served_today || 0, icon: 'fas fa-utensils', color: 'green', action: () => navigate('/meal') },
            { key: 'lunch_cut_today', title: 'Suất trưa báo cắt', value: stats.lunch_cut_today || 0, icon: 'fas fa-ban', color: 'orange', action: () => navigate('/meal') },
            { key: 'dinner_served_today', title: 'Suất tối phục vụ', value: stats.dinner_served_today || 0, icon: 'fas fa-concierge-bell', color: 'purple', action: () => navigate('/meal') },
            { key: 'dinner_cut_today', title: 'Suất tối báo cắt', value: stats.dinner_cut_today || 0, icon: 'fas fa-times-circle', color: 'red', action: () => navigate('/meal') },
        ];

        return (
            <>
                <div className="dashboard-section-title">
                    <i className="fas fa-utensils me-2"></i>
                    Tình hình báo cơm hôm nay
                </div>
                <div className="dashboard-overview">
                    {canteenCards.map((card) => (
                        <div
                            key={card.key}
                            className={`stat-card ${card.color}`}
                            style={{ cursor: 'pointer' }}
                            onClick={card.action}
                        >
                            <div className="stat-card-info">
                                <span className="stat-card-title">{card.title}</span>
                                <span className="stat-card-value">{card.value}</span>
                            </div>
                            <div className="stat-card-icon">
                                <i className={card.icon}></i>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        );
    };

    const renderDefaultDashboard = () => (
        <div className="text-center py-4 text-muted">
            <i className="fas fa-tachometer-alt" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="mt-3">Chào mừng bạn đến với hệ thống quản lý nội trú.</p>
        </div>
    );

    return (
        <Layout>
            <div className="dashboard-clock-bar">
                <i className="fas fa-clock" style={{ fontSize: '2.2rem', opacity: 0.85 }} />
                <div>
                    <p className="hello-user">Xin chào {roleLabel} {user?.display_name || user?.name || user?.username || ''}!</p>
                    <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '2px', fontVariantNumeric: 'tabular-nums' }}>
                        {clockTime}
                    </div>
                    <div style={{ fontSize: '0.95rem', opacity: 0.85, marginTop: '2px' }}>
                        {clockDate}
                    </div>
                    {mockNow && (
                        <span
                            style={{
                                display: 'inline-block',
                                marginTop: '6px',
                                background: '#ffc107',
                                color: '#333',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '20px',
                                letterSpacing: '0.5px',
                            }}
                        >
                            Thời gian ảo
                        </span>
                    )}
                </div>
            </div>

            {approvalNotice.total > 0 && (
                <div className="dashboard-approval-banner">
                    <div className="dashboard-approval-banner-header">
                        <div className="dashboard-approval-banner-title">
                            <i className="fas fa-bell me-2"></i>
                            Việc cần duyệt
                        </div>
                        <span className="dashboard-approval-banner-badge">{approvalNotice.total}</span>
                    </div>
                    <div className="dashboard-approval-banner-items">
                        {approvalNotice.items.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className="dashboard-approval-banner-item"
                                onClick={item.action}
                            >
                                <span>{item.label}</span>
                                <strong>{item.count}</strong>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {stats?.overdue_students_count > 0 && ['manager', 'teacher', 'dorm_manager'].includes(roleName) && (
                <div className="dashboard-warning-banner">
                    <div className="dashboard-warning-banner-header" onClick={() => openFetchDetails('Danh sách học sinh chưa vào trường quá hạn', 'overdue_students')} style={{ cursor: 'pointer' }}>
                        <div className="dashboard-warning-banner-title">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            Cảnh báo: Có {stats.overdue_students_count} học sinh chưa vào trường mặc dù đã qua giờ phép!
                        </div>
                        <span className="dashboard-warning-banner-badge">{stats.overdue_students_count}</span>
                    </div>
                </div>
            )}

            <div className="dashboard-container">
                {roleName === 'manager' && renderManagerDashboard()}
                {roleName === 'teacher' && renderTeacherDashboard()}
                {roleName === 'student' && renderStudentDashboard()}
                {roleName === 'dorm_manager' && renderDormManagerDashboard()}
                {roleName === 'canteen_manager' && renderCanteenManagerDashboard()}
                {!['manager', 'teacher', 'student', 'dorm_manager', 'canteen_manager'].includes(roleName) && renderDefaultDashboard()}
            </div>

            {detailModal.show && (
                <DashboardDetailModal
                    title={detailModal.title}
                    data={detailModal.data}
                    type={detailModal.type}
                    role={roleName}
                    user={user}
                    onRefresh={fetchDashboardData}
                    onInspectRoom={handleInspectRoom}
                    onClose={closeDetails}
                />
            )}
        </Layout>
    );
};

export default Dashboard;
