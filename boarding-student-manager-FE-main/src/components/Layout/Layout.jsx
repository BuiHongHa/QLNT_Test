import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import { apiUrl } from '../../config/api';
import { clearAuthSession, getStoredUser, getUserRole } from '../../config/auth';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState(null);
    const [grades, setGrades] = useState([]);
    const [expandedMenu, setExpandedMenu] = useState(null);
    const [expandedGrade, setExpandedGrade] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
    const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
    const isMobile = () => window.innerWidth <= 768;

    useEffect(() => {
        const currentUser = getStoredUser();
        if (!currentUser) {
            navigate('/login');
            return;
        }
        setUser(currentUser);

        const userRole = getUserRole(currentUser);
        const teacherParam = userRole === 'teacher' && currentUser?.username !== 'admin' ? `?teacher_id=${currentUser.username}` : '';

        fetch(apiUrl(`/api/student/classes${teacherParam}`))
            .then(res => res.json())
            .then(data => {
                if (data.success) setGrades(data.data);
            })
            .catch(err => console.error('Error fetching classes:', err));
    }, [navigate]);

    useEffect(() => {
        if (location.pathname.startsWith('/trash')) {
            setExpandedMenu('other');
            setExpandedGrade('other_trash');
        } else if (location.pathname === '/promote') {
            setExpandedMenu('other');
        } else if (location.pathname === '/students') {
            setExpandedMenu('students');
            const searchParams = new URLSearchParams(location.search);
            const classVal = searchParams.get('class');
            const gradeVal = searchParams.get('grade');
            if (classVal) {
                const match = classVal.match(/^(\d+)/);
                if (match) {
                    setExpandedGrade(match[1]);
                }
            } else if (gradeVal) {
                setExpandedGrade(gradeVal);
            }
        } else if (location.pathname === '/inspection') {
            setExpandedMenu('inspection');
        } else if (location.pathname === '/meals') {
            setExpandedMenu('meals');
        }
    }, [location.pathname, location.search]);

    const handleLogout = () => {
        clearAuthSession();
        navigate('/login');
    };

    const handleChangePasswordSubmit = (e) => {
        e.preventDefault();
        if (passwordForm.new_password !== passwordForm.confirm_password) {
            setPasswordMessage({ text: 'Mật khẩu xác nhận không khớp!', type: 'danger' });
            return;
        }
        if (!passwordForm.new_password || !passwordForm.old_password) {
            setPasswordMessage({ text: 'Vui lòng nhập đủ thông tin!', type: 'danger' });
            return;
        }
        fetch(apiUrl('/api/login/change-password'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user.username,
                old_password: passwordForm.old_password,
                new_password: passwordForm.new_password
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setPasswordMessage({ text: 'Đổi mật khẩu thành công!', type: 'success' });
                    setTimeout(() => {
                        setShowChangePassword(false);
                        setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
                        setPasswordMessage({ text: '', type: '' });
                    }, 1500);
                } else {
                    setPasswordMessage({ text: data.message || data.error, type: 'danger' });
                }
            })
            .catch(() => setPasswordMessage({ text: 'Lỗi kết nối server', type: 'danger' }));
    };

    const handleForgotInModal = () => {
        if (!user || !user.username) {
            setPasswordMessage({ text: 'Không tìm thấy thông tin tài khoản!', type: 'danger' });
            return;
        }
        setPasswordMessage({ text: 'Đang gửi email khôi phục...', type: 'info' });
        fetch(apiUrl('/api/login/forgot-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setPasswordMessage({ text: data.message || 'Đã gửi email khôi phục thành công!', type: 'success' });
                } else {
                    setPasswordMessage({ text: data.message || 'Lỗi gửi email khôi phục.', type: 'danger' });
                }
            })
            .catch(() => setPasswordMessage({ text: 'Lỗi kết nối server', type: 'danger' }));
    };

    const userRoleName = getUserRole(user);

    const MENU_ITEMS = [
        { path: '/dashboard', label: 'Trang chủ', icon: 'fas fa-home', roles: ['all'] },
        { path: '/student-card', label: 'Thẻ học sinh', icon: 'fas fa-id-card', roles: ['student'] },
        { path: '/violations', label: 'Lỗi vi phạm', icon: 'fas fa-exclamation-triangle', roles: ['student'] },
        {
            path: '/students', label: 'Quản lý học sinh', icon: 'fas fa-user-graduate', roles: ['manager', 'admin', 'teacher'], hasSub: true, id: 'students'
        },
        {
            path: '/teachers', label: 'Quản lý giáo viên', icon: 'fas fa-chalkboard-teacher', roles: ['manager', 'admin'], id: 'teachers'
        },
        {
            path: '/dormrooms', label: 'Quản lý phòng ở', icon: 'fas fa-bed', roles: ['manager', 'admin', 'dorm_manager', 'teacher'], id: 'dormrooms'
        },
        {
            path: '/dorm-attendance', label: 'Điểm danh phòng', icon: 'fas fa-user-check', roles: ['manager', 'admin', 'dorm_manager', 'teacher'], id: 'dorm-attendance'
        },
        { path: '/leaves', label: 'Quản lý nghỉ phép', icon: 'fas fa-calendar-check', roles: ['manager', 'admin', 'dorm_manager', 'teacher', 'student'] },
        {
            path: '/meals', label: 'Quản lý nhà ăn', icon: 'fas fa-utensils', roles: ['manager', 'admin', 'canteen_manager', 'teacher', 'student'], hasSub: true, id: 'meals',
            subItems: [
                { path: '/meals?tab=attendance', label: 'Chấm cơm', icon: 'fas fa-check-circle', roles: ['manager', 'admin', 'canteen_manager', 'teacher', 'student'] },
                { path: '/meals?tab=menu', label: 'Thực đơn tuần', icon: 'fas fa-calendar-alt', roles: ['manager', 'admin', 'canteen_manager', 'teacher', 'student'] },
                { path: '/meals?tab=stats', label: 'Thống kê suất ăn', icon: 'fas fa-chart-pie', roles: ['manager', 'admin', 'canteen_manager'] }
            ]
        },
        {
            path: '/inspection', label: 'Chấm điểm phòng', icon: 'fas fa-clipboard-check', roles: ['manager', 'admin', 'dorm_manager', 'teacher'], hasSub: true, id: 'inspection',
            subItems: [
                { path: '/inspection?tab=score', label: 'Chấm điểm', icon: 'fas fa-star', roles: ['manager', 'admin', 'dorm_manager'] },
                { path: '/inspection?tab=list', label: 'Danh sách', icon: 'fas fa-list', roles: ['manager', 'admin', 'dorm_manager', 'teacher'] },
                { path: '/inspection?tab=criteria', label: 'Tiêu chí', icon: 'fas fa-tasks', roles: ['manager', 'admin', 'dorm_manager'] },
                { path: '/inspection?tab=summary', label: 'Tổng hợp', icon: 'fas fa-chart-bar', roles: ['manager', 'admin', 'dorm_manager'] }
            ]
        }
    ];

    const OTHER_ITEM = {
        path: '/other', label: 'Chức năng khác', icon: 'fas fa-cogs', roles: ['manager', 'admin'], hasSub: true, id: 'other',
        subItems: [
            {
                label: 'Dữ liệu đã xoá', icon: 'fas fa-trash-alt', roles: ['manager', 'admin'], id: 'other_trash',
                subItems: [
                    { path: '/trash/students', label: 'Học sinh đã xoá', icon: 'fas fa-user-times', roles: ['manager', 'admin'] },
                    { path: '/trash/teachers', label: 'Giáo viên đã xoá', icon: 'fas fa-user-times', roles: ['manager', 'admin'] },
                    { path: '/trash/rooms', label: 'Phòng đã xoá', icon: 'fas fa-door-closed', roles: ['manager', 'admin'] }
                ]
            },
            { path: '/promote', label: 'Lên lớp', icon: 'fas fa-graduation-cap', roles: ['manager', 'admin'] }
        ]
    };

    const closeMobileSidebar = () => setIsMobileOpen(false);

    const css = `
        /* ── Base layout ── */
        .layout-wrapper {
            display: flex;
            min-height: 100vh;
        }

        /* ── Sidebar ── */
        .left-sidebar {
            width: 260px;
            background: #223771;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            transition: width 0.25s ease;
            overflow: hidden;
            position: sticky;
            top: 0;
            height: 100vh;
            z-index: 1030;
        }
        .left-sidebar.collapsed {
            width: 72px;
        }
        .left-sidebar.collapsed .sidebar-topbar {
            flex-direction: column;
            justify-content: center;
            gap: 8px;
            padding: 12px 0;
            min-height: 104px;
        }
        .sidebar-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 14px;
            min-height: 72px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .sidebar-logo {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sidebar-logo img {
            max-width: 140px;
            max-height: 48px;
            object-fit: contain;
            display: block;
            transition: all 0.25s;
        }
        .left-sidebar.collapsed .sidebar-logo img {
            max-width: 40px;
            max-height: 40px;
        }
        .left-sidebar.collapsed .sidebar-logo {
            width: 100%;
            flex: 0 0 auto;
            display: flex;
            justify-content: center;
        }
        .sidebar-toggle-btn {
            width: 34px;
            height: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: #fff;
            cursor: pointer;
            flex-shrink: 0;
            transition: background 0.2s;
        }
        .sidebar-toggle-btn:hover { background: rgba(255,255,255,0.22); }
        .left-sidebar.collapsed .sidebar-toggle-btn {
            margin: 0 auto;
        }

        /* ── Menu items ── */
        .sidebar-nav { padding: 8px 0; overflow-y: auto; flex: 1; -ms-overflow-style: none; scrollbar-width: none; }
        .sidebar-nav::-webkit-scrollbar { display: none; }
        .sidebar-nav-bottom { padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.1); }
        .sidebar-menu-item.active .sidebar-menu-header {
            background: rgba(255,255,255,0.15);
            border-left: 4px solid #fff;
        }
        .sidebar-menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            cursor: pointer;
            color: #fff;
            min-height: 48px;
            transition: background 0.2s;
        }
        .sidebar-menu-header:hover { background: rgba(255,255,255,0.08); }
        .menu-main { display: flex; align-items: center; gap: 10px; }
        .menu-main i { width: 20px; text-align: center; color: #fff; font-size: 1rem; flex-shrink: 0; }
        .menu-label { color: #fff; white-space: nowrap; font-size: 0.9rem; }
        .menu-arrow { color: rgba(255,255,255,0.7); font-size: 0.7rem; flex-shrink: 0; }
        .left-sidebar.collapsed .menu-label,
        .left-sidebar.collapsed .menu-arrow,
        .left-sidebar.collapsed .sub-menu { display: none !important; }
        .left-sidebar.collapsed .sidebar-menu-header { justify-content: center; padding: 12px 0; }
        .left-sidebar.collapsed .menu-main { justify-content: center; }
        .left-sidebar.collapsed .menu-main i { width: 72px; }

        /* ── Sub menu ── */
        .sub-menu { background: rgba(0,0,0,0.2); }
        .grade-header {
            padding: 10px 15px 10px 45px;
            color: rgba(255,255,255,0.85);
            font-size: 0.85rem;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s;
        }
        .grade-header:hover { background: rgba(255,255,255,0.07); }
        .grade-header.active { color: #fff; font-weight: 600; background: rgba(255,255,255,0.14); }
        .tree-item {
            padding: 8px 15px 8px 65px;
            color: rgba(255,255,255,0.75);
            font-size: 0.82rem;
            display: block;
            text-decoration: none;
            transition: all 0.2s;
        }
        .tree-item:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .tree-item.active { color: #fff; font-weight: 600; background: rgba(255,255,255,0.14); }

        /* ── Content page ── */
        .content-page {
            flex: 1;
            min-width: 0;
            background: #223771; /* Match sidebar/navbar background */
            display: flex;
            flex-direction: column;
        }

        /* ── Topbar / Navbar ── */
        .layout-navbar {
            display: flex;
            align-items: center;
            padding: 0 20px;
            min-height: 64px;
            background: #223771;
            color: #fff;
            gap: 12px;
            flex-shrink: 0;
            position: sticky;
            top: 0;
            z-index: 1020;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .hamburger-btn {
            display: none;
            width: 38px;
            height: 38px;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 6px;
            background: rgba(255,255,255,0.12);
            color: #fff;
            cursor: pointer;
            flex-shrink: 0;
        }
        .hamburger-btn:hover { background: rgba(255,255,255,0.22); }
        .navbar-logo-center {
            display: none;
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            line-height: 0;
        }
        .navbar-logo-center img { max-width: 130px; max-height: 44px; object-fit: contain; }
        .navbar-school-name {
            font-size: 1rem;
            font-weight: 600;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }
        .navbar-right { margin-left: auto; display: flex; align-items: center; }
        .user-dropdown-btn {
            background: none;
            border: none;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 0.9rem;
            max-width: 220px;
        }
        .user-dropdown-btn:hover { background: rgba(255,255,255,0.1); }
        .user-name-text {
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ── Overlay (mobile) ── */
        .sidebar-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 1040;
        }
        .sidebar-overlay.show { display: block; }

        /* ── Content area ── */
        .layout-content {
            flex: 1;
            background: var(--bg-color, #f1f5f9);
            border-top-left-radius: 24px;
            border-bottom-left-radius: 24px;
            overflow: hidden;
            box-shadow: -4px -4px 15px rgba(0,0,0,0.05);
        }
        .left-sidebar.collapsed ~ .content-page .layout-content {
            border-top-left-radius: 24px;
            border-bottom-left-radius: 24px;
        }
        .layout-footer { background: #223771; color: rgba(255,255,255,0.75); font-size: 0.78rem; padding: 12px 20px; text-align: center; }

        /* ──────────────────────────────
           RESPONSIVE — Mobile ≤ 768px
        ────────────────────────────── */
        @media (max-width: 768px) {
            .layout-wrapper { display: block; }

            /* Sidebar becomes fixed drawer */
            .left-sidebar {
                position: fixed;
                top: 0;
                bottom: 0;
                left: -270px;
                width: 260px !important;
                transition: left 0.3s ease;
                z-index: 1050;
                overflow-y: auto;
            }
            .left-sidebar.mobile-open { left: 0; }
            .left-sidebar .sidebar-topbar { display: none; }

            /* Content always full-width */
            .content-page { width: 100% !important; }

            /* Show hamburger, hide desktop sidebar toggle */
            .hamburger-btn { display: inline-flex; }
            .sidebar-toggle-btn { display: none !important; }

            /* Center logo in navbar */
            .layout-navbar { position: relative; padding: 0 14px; }
            .navbar-logo-center { display: block; }
            .navbar-school-name { display: none; }
            .left-sidebar.collapsed .menu-label,
            .left-sidebar.collapsed .menu-arrow { display: inline !important; }
            .left-sidebar.collapsed .sub-menu { display: block !important; }
            .left-sidebar.collapsed .sidebar-menu-header { justify-content: space-between; padding: 12px 20px; }
            .left-sidebar.collapsed .menu-main { justify-content: flex-start; }
            .left-sidebar.collapsed .menu-main i { width: 20px; }

            /* Truncate username more aggressively */
            .user-name-text { max-width: 80px; }
        }

        /* ── Tablet 769-1024 ── */
        @media (min-width: 769px) and (max-width: 1024px) {
            .left-sidebar { width: 220px; }
            .left-sidebar.collapsed { width: 64px; }
            .navbar-school-name { display: none; }
        }
    `;

    const renderMenuItem = (item, index) => {
        if (!item.roles.includes('all') && !item.roles.includes(userRoleName)) return null;
        const isActive = location.pathname === item.path ||
            (item.id === 'other' && (location.pathname.startsWith('/trash') || location.pathname === '/promote')) ||
            (item.id === 'trash' && location.pathname.startsWith('/trash'));
        const isExpanded = expandedMenu === item.id;

        const isSubActive = (sub) => {
            const currentPath = location.pathname + location.search;
            if (currentPath === sub.path) return true;
            if (location.pathname === '/inspection' && sub.path.startsWith('/inspection')) {
                const tabParam = new URLSearchParams(location.search).get('tab');
                const subTab = new URLSearchParams(sub.path.split('?')[1]).get('tab');
                if (tabParam) {
                    return tabParam === subTab;
                } else {
                    const defaultTab = userRoleName === 'teacher' ? 'list' : 'score';
                    return subTab === defaultTab;
                }
            }
            if (location.pathname === '/meals' && sub.path.startsWith('/meals')) {
                const tabParam = new URLSearchParams(location.search).get('tab');
                const subTab = new URLSearchParams(sub.path.split('?')[1]).get('tab');
                if (tabParam) {
                    return tabParam === subTab;
                } else {
                    return subTab === 'attendance';
                }
            }
            return location.pathname === sub.path;
        };

        return (
            // đặt sidebar-bottom-menu-item cho other, không thì sidebar-menu-item
            <div className={`${item.id === 'other' || item.id === 'trash' ? 'sidebar-bottom-menu-item' : 'sidebar-menu-item'} ${isActive ? 'active' : ''}`} key={index}>
                <div
                    className="sidebar-menu-header"
                    onClick={() => {
                        if (item.hasSub) {
                            setExpandedMenu(isExpanded ? null : item.id);
                            if (!isExpanded && item.id !== 'trash' && item.id !== 'other') navigate(item.path);
                        } else {
                            setExpandedMenu(null);
                            navigate(item.path);
                            closeMobileSidebar();
                        }
                    }}
                >
                    <div className="menu-main">
                        <i className={item.icon}></i>
                        <span className="menu-label">{item.label}</span>
                    </div>
                    {item.hasSub && (
                        <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} menu-arrow`}></i>
                    )}
                </div>

                {item.hasSub && isExpanded && (
                    <div className="sub-menu">
                        {item.id === 'students' && grades.map(g => {
                            const isGradeExpanded = expandedGrade === g.grade;
                            return (
                                <div key={g.grade}>
                                    <div
                                        className={`grade-header ${location.search.includes(`grade=${g.grade}`) ? 'active' : ''}`}
                                        onClick={() => {
                                            setExpandedGrade(isGradeExpanded ? null : g.grade);
                                            navigate(`/students?grade=${g.grade}`);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <span>
                                            <i className={`fas fa-folder${isGradeExpanded ? '-open' : ''} me-2`} style={{ fontSize: '0.8rem' }}></i>
                                            Khối {g.grade}
                                        </span>
                                        <i className={`fas fa-chevron-${isGradeExpanded ? 'down' : 'right'}`} style={{ fontSize: '0.6rem' }}></i>
                                    </div>
                                    {isGradeExpanded && g.classes.map(c => {
                                        const isClassActive = location.search.includes(`class=${c}`);
                                        return (
                                            <Link
                                                key={c}
                                                to={`/students?class=${c}`}
                                                className={`tree-item ${isClassActive ? 'active' : ''}`}
                                                onClick={closeMobileSidebar}
                                            >
                                                <i className="far fa-circle me-2" style={{ fontSize: '0.5rem', width: '16px', textAlign: 'center' }}></i>
                                                Lớp {c}
                                            </Link>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {item.id === 'other' && (
                            <>
                                <div>
                                    <div
                                        className={`grade-header ${location.pathname.startsWith('/trash') ? 'active' : ''}`}
                                        onClick={() => setExpandedGrade(expandedGrade === 'other_trash' ? null : 'other_trash')}
                                    >
                                        <span>
                                            <i className="fas fa-trash-alt me-2 text-center" style={{ fontSize: '0.8rem', width: '16px' }}></i>
                                            Dữ liệu đã xoá
                                        </span>
                                        <i className={`fas fa-chevron-${expandedGrade === 'other_trash' ? 'down' : 'right'}`} style={{ fontSize: '0.6rem' }}></i>
                                    </div>
                                    {expandedGrade === 'other_trash' && (
                                        <>
                                            <Link
                                                to="/trash/students"
                                                className={`tree-item text-decoration-none ${location.pathname === '/trash/students' ? 'active' : ''}`}
                                                onClick={closeMobileSidebar}
                                            >
                                                <i className="fas fa-user-times me-2 text-center" style={{ fontSize: '0.7rem', width: '16px' }}></i>
                                                Học sinh đã xoá
                                            </Link>
                                            <Link
                                                to="/trash/teachers"
                                                className={`tree-item text-decoration-none ${location.pathname === '/trash/teachers' ? 'active' : ''}`}
                                                onClick={closeMobileSidebar}
                                            >
                                                <i className="fas fa-user-times me-2 text-center" style={{ fontSize: '0.7rem', width: '16px' }}></i>
                                                Giáo viên đã xoá
                                            </Link>
                                            <Link
                                                to="/trash/rooms"
                                                className={`tree-item text-decoration-none ${location.pathname === '/trash/rooms' ? 'active' : ''}`}
                                                onClick={closeMobileSidebar}
                                            >
                                                <i className="fas fa-door-closed me-2 text-center" style={{ fontSize: '0.7rem', width: '16px' }}></i>
                                                Phòng đã xoá
                                            </Link>
                                        </>
                                    )}
                                </div>
                                <Link
                                    to="/promote"
                                    className={`grade-header text-decoration-none ${location.pathname === '/promote' ? 'active' : ''}`}
                                    onClick={closeMobileSidebar}
                                >
                                    <div>
                                        <i className="fas fa-graduation-cap me-2 text-center" style={{ fontSize: '0.8rem', width: '16px' }}></i>
                                        Lên lớp
                                    </div>
                                </Link>
                            </>
                        )}
                        {item.id !== 'other' && item.subItems && item.subItems.map((sub, i) => {
                            if (!sub.roles.includes('all') && !sub.roles.includes(userRoleName)) return null;
                            return (
                                <Link
                                    key={`sub-${i}`}
                                    to={sub.path}
                                    className={`grade-header text-decoration-none ${isSubActive(sub) ? 'active' : ''}`}
                                    onClick={closeMobileSidebar}
                                >
                                    <div>
                                        <i className={`${sub.icon} me-2 text-center`} style={{ fontSize: '0.8rem', width: '16px' }}></i>
                                        {sub.label}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="layout-wrapper">
            <style>{css}</style>

            {/* Mobile overlay */}
            <div
                className={`sidebar-overlay ${isMobileOpen ? 'show' : ''}`}
                onClick={closeMobileSidebar}
            />

            {/* Sidebar */}
            <div className={`left-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-topbar">
                    <div className="sidebar-logo">
                        <img src={logo} alt="UTC Logo" />
                    </div>
                    <button
                        className="sidebar-toggle-btn"
                        type="button"
                        title={isSidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                        onClick={() => setIsSidebarCollapsed(prev => !prev)}
                    >
                        <i className={`fas fa-angle-${isSidebarCollapsed ? 'right' : 'left'}`}></i>
                    </button>
                </div>

                <div className="sidebar-nav">
                    {MENU_ITEMS.map((item, index) => renderMenuItem(item, index))}
                </div>

                {OTHER_ITEM.roles.includes(userRoleName) && (
                    <div className="sidebar-nav-bottom">
                        {renderMenuItem(OTHER_ITEM, 'other')}
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className="content-page">
                {/* Navbar */}
                <div className="layout-navbar">
                    {/* Hamburger — mobile only */}
                    <button
                        className="hamburger-btn"
                        type="button"
                        aria-label="Mở menu"
                        onClick={() => setIsMobileOpen(prev => !prev)}
                    >
                        <i className="fas fa-bars"></i>
                    </button>

                    {/* Logo center on mobile */}
                    <div className="navbar-logo-center">
                        <img src={logo} alt="UTC Logo" />
                    </div>

                    <div className="navbar-school-name">Trường PT DTNT THPT Hoà Bình</div>

                    {/* Right side: user dropdown */}
                    <div className="navbar-right">
                        <div className="dropdown">
                            <button
                                className="user-dropdown-btn"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="fas fa-user-circle" style={{ fontSize: '1.2rem' }}></i>
                                <span className="user-name-text d-none d-sm-inline">
                                    {user?.display_name || user?.name || user?.username || 'Người dùng'}
                                </span>
                                <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                            <ul className="dropdown-menu dropdown-menu-end shadow-sm">
                                <li>
                                    <span className="dropdown-item-text text-muted small">
                                        {user?.display_name || user?.name || user?.username}
                                    </span>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li>
                                    <button className="dropdown-item" onClick={() => {
                                        setShowChangePassword(true);
                                        setPasswordMessage({ text: '', type: '' });
                                        setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
                                    }}>
                                        <i className="fas fa-key me-2 text-primary"></i>Đổi mật khẩu
                                    </button>
                                </li>
                                <li>
                                    <button className="dropdown-item" onClick={handleLogout}>
                                        <i className="fas fa-sign-out-alt me-2 text-danger"></i>Đăng xuất
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Page content */}
                <div className="layout-content" id="main-content-wrapper">
                    {children}
                </div>

                {/* Footer */}
                <div className="layout-footer">
                    {/* <marquee>
                        Đơn vị phát triển: Công ty Cổ Phần dịch vụ Công nghệ APIS - Địa chỉ: Tầng 6 Tháp Tây, Tòa nhà Hancorp, Số 72 Trần Đăng Ninh, P. Cầu Giấy, Hà Nội
                    </marquee> */}
                </div>
            </div>

            {/* Change Password Modal */}
            {showChangePassword && (
                <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <form onSubmit={handleChangePasswordSubmit}>
                                <div className="modal-header">
                                    <h5 className="modal-title">Đổi mật khẩu</h5>
                                    <button type="button" className="btn-close" onClick={() => setShowChangePassword(false)}></button>
                                </div>
                                <div className="modal-body">
                                    {passwordMessage.text && (
                                        <div className={`alert alert-${passwordMessage.type} small py-2`}>
                                            {passwordMessage.text}
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Mật khẩu hiện tại</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={passwordForm.old_password}
                                            onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Mật khẩu mới</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={passwordForm.new_password}
                                            onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                                            required
                                            minLength={4}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Xác nhận mật khẩu mới</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={passwordForm.confirm_password}
                                            onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3 d-flex justify-content-between align-items-center">
                                        <button
                                            type="button"
                                            className="btn btn-link p-0 text-decoration-none"
                                            style={{ fontSize: '14px', color: '#dc3545' }}
                                            onClick={handleForgotInModal}
                                        >
                                            Quên mật khẩu? Gửi yêu cầu qua Email
                                        </button>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowChangePassword(false)}>Huỷ</button>
                                    <button type="submit" className="btn btn-primary">Lưu thay đổi</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
