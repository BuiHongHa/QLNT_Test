import { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';

const StudentViolations = () => {
    const user = getStoredUser() || {};
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterScope, setFilterScope] = useState('ALL'); // 'ALL' | 'PERSONAL' | 'ROOM'
    const [searchTerm, setSearchTerm] = useState('');

    const fetchViolations = () => {
        if (!user.username) return;
        setLoading(true);
        fetch(apiUrl(`/api/student/${user.username}/violations`))
            .then(res => res.json())
            .then(resData => {
                if (resData.success) {
                    setData(resData.data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchViolations();
    }, [user.username]);

    const student = data?.student;
    const summary = data?.summary || { total_violations: 0, total_penalty: 0, month_penalty: 0, personal_count: 0, room_count: 0 };
    const violations = data?.violations || [];

    const filteredViolations = useMemo(() => {
        return violations.filter(v => {
            if (filterScope === 'PERSONAL' && v.violation_scope !== 'Cá nhân') return false;
            if (filterScope === 'ROOM' && v.violation_scope !== 'Tập thể phòng') return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchCriteria = (v.criteria_name || '').toLowerCase().includes(term);
                const matchNote = (v.violation_note || '').toLowerCase().includes(term);
                const matchRoom = (v.room_name || '').toLowerCase().includes(term);
                return matchCriteria || matchNote || matchRoom;
            }
            return true;
        });
    }, [violations, filterScope, searchTerm]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.slice(0, 10).split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    };

    return (
        <div style={{ padding: '20px' }}>
            {/* Tiêu đề & Thông tin học sinh */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 bg-white p-3 rounded shadow-sm">
                <div>
                    <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>
                        <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                        Lịch sử vi phạm nội quy & kiểm tra phòng
                    </h2>
                    <div className="text-muted mt-1 small">
                        Theo dõi các biên bản kiểm tra phòng KTX và lỗi vi phạm cá nhân / tập thể phòng
                    </div>
                </div>
                {student && (
                    <div className="d-flex align-items-center gap-3 bg-light p-2 px-3 rounded border">
                        <div>
                            <div className="fw-bold text-dark">{student.name}</div>
                            <div className="small text-muted">
                                Mã: <strong>{student.id_VNeID}</strong> | Lớp: <strong>{student.class_name || 'Chưa xếp lớp'}</strong>
                            </div>
                        </div>
                        {student.room_name && (
                            <span className="badge bg-primary px-3 py-2">
                                <i className="fas fa-bed me-1"></i> Phòng {student.room_name}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Thẻ tóm tắt tổng quan */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-sm-6 col-xl-3">
                    <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #0d6efd' }}>
                        <div className="text-muted small fw-bold">TỔNG SỐ LẦN VI PHẠM</div>
                        <div className="h3 fw-bold text-primary mt-2 mb-0">
                            {summary.total_violations}
                        </div>
                        <div className="small text-muted mt-1">
                            {summary.personal_count} cá nhân | {summary.room_count} tập thể phòng
                        </div>
                    </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                    <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #dc3545' }}>
                        <div className="text-muted small fw-bold">TỔNG ĐIỂM TRỪ TÍCH LŨY</div>
                        <div className="h3 fw-bold text-danger mt-2 mb-0">
                            -{summary.total_penalty.toFixed(1)} <span className="small fs-6 text-muted">điểm</span>
                        </div>
                        <div className="small text-muted mt-1">Tổng cộng các lần vi phạm</div>
                    </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                    <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #ff9800' }}>
                        <div className="text-muted small fw-bold">ĐIỂM TRỪ THÁNG NÀY</div>
                        <div className="h3 fw-bold text-warning mt-2 mb-0">
                            -{summary.month_penalty.toFixed(1)} <span className="small fs-6 text-muted">điểm</span>
                        </div>
                        <div className="small text-muted mt-1">Trong tháng hiện tại</div>
                    </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                    <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #198754' }}>
                        <div className="text-muted small fw-bold">TÌNH TRẠNG KỶ LUẬT</div>
                        <div className="mt-2 mb-0">
                            {summary.total_violations === 0 ? (
                                <span className="badge bg-success fs-6 px-3 py-2">Rất tốt (0 lỗi)</span>
                            ) : summary.total_penalty <= 5 ? (
                                <span className="badge bg-info text-dark fs-6 px-3 py-2">Bình thường</span>
                            ) : (
                                <span className="badge bg-danger fs-6 px-3 py-2">Cần chấn chỉnh</span>
                            )}
                        </div>
                        <div className="small text-muted mt-1">Đánh giá nền nếp nội trú</div>
                    </div>
                </div>
            </div>

            {/* Bảng danh sách chi tiết */}
            <div className="card border-0 shadow-sm rounded-3">
                <div className="card-header bg-white py-3 px-3">
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <h5 className="mb-0 fw-bold text-dark">
                            <i className="fas fa-list-alt text-primary me-2"></i>
                            Danh sách chi tiết các biên bản vi phạm
                        </h5>

                        <div className="d-flex align-items-center gap-2 flex-wrap">
                            {/* Lọc phạm vi */}
                            <div className="btn-group btn-group-sm" role="group">
                                <button
                                    type="button"
                                    className={`btn ${filterScope === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
                                    onClick={() => setFilterScope('ALL')}
                                >
                                    Tất cả ({violations.length})
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${filterScope === 'PERSONAL' ? 'btn-primary' : 'btn-outline-primary'}`}
                                    onClick={() => setFilterScope('PERSONAL')}
                                >
                                    Cá nhân ({summary.personal_count})
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${filterScope === 'ROOM' ? 'btn-primary' : 'btn-outline-primary'}`}
                                    onClick={() => setFilterScope('ROOM')}
                                >
                                    Tập thể phòng ({summary.room_count})
                                </button>
                            </div>

                            {/* Ô tìm kiếm */}
                            <div className="input-group input-group-sm" style={{ width: '220px' }}>
                                <span className="input-group-text bg-light border-end-0">
                                    <i className="fas fa-search text-muted"></i>
                                </span>
                                <input
                                    type="text"
                                    className="form-control border-start-0"
                                    placeholder="Tìm tiêu chí, ghi chú..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="table table-hover table-bordered align-middle mb-0 text-center">
                        <thead className="table-light">
                            <tr>
                                <th style={{ width: '50px' }}>STT</th>
                                <th style={{ width: '120px' }}>Ngày kiểm tra</th>
                                <th style={{ width: '100px' }}>Phòng</th>
                                <th style={{ width: '130px' }}>Phạm vi</th>
                                <th className="text-start" style={{ minWidth: '220px' }}>Tiêu chí vi phạm</th>
                                <th style={{ width: '110px' }}>Điểm trừ</th>
                                <th className="text-start" style={{ minWidth: '250px' }}>Chi tiết / Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-4 text-muted">
                                        <i className="fas fa-spinner fa-spin me-2"></i> Đang tải dữ liệu vi phạm...
                                    </td>
                                </tr>
                            ) : filteredViolations.length > 0 ? (
                                filteredViolations.map((v, idx) => (
                                    <tr key={v.id || idx}>
                                        <td>{idx + 1}</td>
                                        <td className="fw-bold">{formatDate(v.inspection_date_str || v.inspection_date)}</td>
                                        <td>
                                            <span className="badge bg-light text-dark border">
                                                {v.room_name || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${v.violation_scope === 'Cá nhân' ? 'bg-danger' : 'bg-warning text-dark'}`}>
                                                {v.violation_scope}
                                            </span>
                                        </td>
                                        <td className="text-start fw-semibold text-dark">
                                            {v.criteria_name}
                                            {v.criteria_desc && (
                                                <div className="small text-muted fw-normal">{v.criteria_desc}</div>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-danger fw-bold fs-6">
                                                -{parseFloat(v.penalty_points || 0).toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="text-start">
                                            <div>{v.violation_note || 'Không có ghi chú thêm'}</div>
                                            {v.inspection_note && (
                                                <div className="small text-muted fst-italic mt-1">
                                                    Đợt kiểm tra: {v.inspection_note}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7" className="py-5 text-center">
                                        <div className="text-success mb-2">
                                            <i className="fas fa-check-circle fa-3x"></i>
                                        </div>
                                        <h5 className="fw-bold text-success">Không có lỗi vi phạm nào!</h5>
                                        <p className="text-muted small mb-0">
                                            Bạn đang chấp hành rất tốt nội quy phòng ở và ký túc xá.
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="card-footer bg-light py-2 px-3 small text-muted d-flex justify-content-between align-items-center">
                    <span>
                        <i className="fas fa-info-circle me-1"></i>
                        Điểm trừ vi phạm ảnh hưởng đến xếp loại thi đua tháng và xét duyệt phòng ở nội trú.
                    </span>
                    <button className="btn btn-outline-secondary btn-sm" onClick={fetchViolations}>
                        <i className="fas fa-sync-alt me-1"></i> Làm mới
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StudentViolations;
