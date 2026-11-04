import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const API_MEAL = apiUrl('/api/meal');

const MealStats = ({ user, roleName, mockToday }) => {
    const [statType, setStatType] = useState('day'); // 'day' | 'week'
    const [currentDate, setCurrentDate] = useState(mockToday || new Date().toISOString().slice(0, 10));
    const [selectedClass, setSelectedClass] = useState('');
    const [statData, setStatData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (mockToday && !currentDate) {
            setCurrentDate(mockToday);
        }
    }, [mockToday]);

    const fetchStatistics = () => {
        setLoading(true);
        const params = new URLSearchParams({
            type: statType,
            date: currentDate,
            role_name: roleName,
            username: user?.username || ''
        });
        if (selectedClass) {
            params.set('class_name', selectedClass);
        }

        fetch(`${API_MEAL}/statistics?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setStatData(data.data);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (currentDate) {
            fetchStatistics();
        }
    }, [statType, currentDate, selectedClass]);

    const changeDay = (offset) => {
        const [y, m, d] = currentDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d + offset);
        const pad = (n) => String(n).padStart(2, '0');
        setCurrentDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
    };

    const changeWeek = (offsetDays) => {
        if (!statData?.week_start) {
            changeDay(offsetDays);
            return;
        }
        const [y, m, d] = statData.week_start.split('-').map(Number);
        const dt = new Date(y, m - 1, d + offsetDays);
        const pad = (n) => String(n).padStart(2, '0');
        setCurrentDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
    };

    const goToToday = () => {
        setCurrentDate(mockToday || new Date().toISOString().slice(0, 10));
    };

    const formatShortDate = (dStr) => {
        if (!dStr) return '';
        const parts = dStr.split('-');
        return `${parts[2]}/${parts[1]}`;
    };

    const schoolSum = statData?.school_summary;

    return (
        <div>
            {/* Thanh điều khiển bộ lọc */}
            <div className="bg-white p-3 rounded shadow-sm mb-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                    {/* Chuyển loại thống kê: Ngày / Tuần */}
                    <div className="btn-group" role="group">
                        <button
                            type="button"
                            className={`btn ${statType === 'day' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setStatType('day')}
                        >
                            <i className="fas fa-calendar-day me-1"></i> Theo Ngày
                        </button>
                        <button
                            type="button"
                            className={`btn ${statType === 'week' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setStatType('week')}
                        >
                            <i className="fas fa-calendar-week me-1"></i> Theo Tuần
                        </button>
                    </div>

                    {/* Bộ điều hướng thời gian */}
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        {statType === 'day' ? (
                            <>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => changeDay(-1)}>
                                    <i className="fas fa-chevron-left me-1"></i> Hôm trước
                                </button>
                                <button className="btn btn-outline-primary btn-sm" onClick={goToToday}>
                                    Hôm nay
                                </button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => changeDay(1)}>
                                    Hôm sau <i className="fas fa-chevron-right ms-1"></i>
                                </button>
                                <input
                                    type="date"
                                    className="form-control form-control-sm"
                                    value={currentDate}
                                    onChange={(e) => setCurrentDate(e.target.value)}
                                    style={{ width: '150px' }}
                                />
                            </>
                        ) : (
                            <>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => changeWeek(-7)}>
                                    <i className="fas fa-chevron-left me-1"></i> Tuần trước
                                </button>
                                <button className="btn btn-outline-primary btn-sm" onClick={goToToday}>
                                    Tuần này
                                </button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => changeWeek(7)}>
                                    Tuần sau <i className="fas fa-chevron-right ms-1"></i>
                                </button>
                                {statData?.week_start && (
                                    <span className="fw-bold text-primary ms-1" style={{ fontSize: '0.95rem' }}>
                                        {formatShortDate(statData.week_start)} - {formatShortDate(statData.week_end)}/{statData.week_start.slice(0, 4)}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* Lọc theo Lớp */}
                    <div className="d-flex align-items-center gap-2">
                        <span className="small fw-bold text-muted text-nowrap">Lọc lớp:</span>
                        <select
                            className="form-select form-select-sm"
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            style={{ minWidth: '150px' }}
                        >
                            <option value="">-- Toàn trường --</option>
                            {statData?.classes?.map((c) => (
                                <option key={c} value={c}>
                                    Lớp {c}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-5 bg-white rounded shadow-sm">
                    <i className="fas fa-spinner fa-spin fa-2x text-primary mb-2"></i>
                    <p className="text-muted">Đang tổng hợp số liệu suất ăn...</p>
                </div>
            ) : statType === 'day' ? (
                /* GIAO DIỆN THỐNG KÊ THEO NGÀY */
                <div>
                    {/* Thẻ tổng quan */}
                    <div className="row g-3 mb-4">
                        <div className="col-12 col-sm-6 col-xl-3">
                            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #0d6efd' }}>
                                <div className="text-muted small fw-bold">TỔNG SỐ HỌC SINH</div>
                                <div className="h3 fw-bold text-primary mt-2 mb-0">
                                    {schoolSum?.total_students || 0}
                                </div>
                                <div className="small text-muted mt-1">Đang theo học tại trường</div>
                            </div>
                        </div>

                        <div className="col-12 col-sm-6 col-xl-3">
                            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #ff9800' }}>
                                <div className="text-muted small fw-bold">BỮA TRƯA HÔM NAY</div>
                                <div className="d-flex align-items-baseline gap-2 mt-2">
                                    <span className="h3 fw-bold text-success mb-0">{schoolSum?.lunch_eating || 0}</span>
                                    <span className="small text-muted">suất ăn (X)</span>
                                </div>
                                <div className="small text-danger mt-1">
                                    <i className="fas fa-ban me-1"></i> Cắt cơm (O): <strong>{schoolSum?.lunch_cut || 0}</strong> suất
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-sm-6 col-xl-3">
                            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #673ab7' }}>
                                <div className="text-muted small fw-bold">BỮA TỐI HÔM NAY</div>
                                <div className="d-flex align-items-baseline gap-2 mt-2">
                                    <span className="h3 fw-bold text-success mb-0">{schoolSum?.dinner_eating || 0}</span>
                                    <span className="small text-muted">suất ăn (X)</span>
                                </div>
                                <div className="small text-danger mt-1">
                                    <i className="fas fa-ban me-1"></i> Cắt cơm (O): <strong>{schoolSum?.dinner_cut || 0}</strong> suất
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-sm-6 col-xl-3">
                            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white" style={{ borderLeft: '5px solid #198754' }}>
                                <div className="text-muted small fw-bold">TỔNG SUẤT ĂN CẢ NGÀY</div>
                                <div className="h3 fw-bold text-success mt-2 mb-0">
                                    {schoolSum?.total_eating || 0}
                                </div>
                                <div className="small text-muted mt-1">
                                    Tổng suất cắt: <strong>{schoolSum?.total_cut || 0}</strong> suất
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bảng chi tiết theo lớp trong ngày */}
                    <div className="card border-0 shadow-sm rounded-3">
                        <div className="card-header bg-white py-3 px-3 d-flex justify-content-between align-items-center">
                            <h5 className="mb-0 fw-bold text-dark" style={{ fontSize: '1.05rem' }}>
                                <i className="fas fa-list-alt text-primary me-2"></i>
                                Chi tiết số lượng suất ăn theo lớp - Ngày {formatShortDate(statData?.date)} ({statData?.day_name})
                            </h5>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-hover table-bordered align-middle mb-0 text-center">
                                <thead className="table-light">
                                    <tr>
                                        <th rowSpan="2" className="text-start" style={{ minWidth: '130px' }}>Lớp</th>
                                        <th rowSpan="2">Sĩ số</th>
                                        <th colSpan="2" className="table-warning text-dark">Bữa Trưa</th>
                                        <th colSpan="2" className="table-info text-dark">Bữa Tối</th>
                                        <th rowSpan="2" className="table-success text-dark">Tổng suất ăn</th>
                                        <th rowSpan="2">Tỷ lệ ăn</th>
                                    </tr>
                                    <tr>
                                        <th className="text-success">Ăn (X)</th>
                                        <th className="text-danger">Cắt (O)</th>
                                        <th className="text-success">Ăn (X)</th>
                                        <th className="text-danger">Cắt (O)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statData?.by_class?.map((row) => {
                                        const totalCapacity = row.student_count * 2;
                                        const rate = totalCapacity > 0 ? ((row.total_eating / totalCapacity) * 100).toFixed(1) : 0;
                                        return (
                                            <tr key={row.class_name}>
                                                <td className="text-start fw-bold">{row.class_name}</td>
                                                <td>{row.student_count}</td>
                                                <td className="fw-bold text-success">{row.lunch_eating}</td>
                                                <td className="text-danger">{row.lunch_cut}</td>
                                                <td className="fw-bold text-success">{row.dinner_eating}</td>
                                                <td className="text-danger">{row.dinner_cut}</td>
                                                <td className="fw-bold text-success table-success">{row.total_eating}</td>
                                                <td>
                                                    <span className={`badge ${rate >= 90 ? 'bg-success' : rate >= 70 ? 'bg-warning text-dark' : 'bg-danger'}`}>
                                                        {rate}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(!statData?.by_class || statData.by_class.length === 0) && (
                                        <tr>
                                            <td colSpan="8" className="text-muted py-3">Không có dữ liệu</td>
                                        </tr>
                                    )}
                                </tbody>
                                {statData?.by_class?.length > 0 && (
                                    <tfoot className="table-light fw-bold">
                                        <tr>
                                            <td className="text-start">TỔNG TOÀN TRƯỜNG</td>
                                            <td>{schoolSum?.total_students}</td>
                                            <td className="text-success">{schoolSum?.lunch_eating}</td>
                                            <td className="text-danger">{schoolSum?.lunch_cut}</td>
                                            <td className="text-success">{schoolSum?.dinner_eating}</td>
                                            <td className="text-danger">{schoolSum?.dinner_cut}</td>
                                            <td className="text-success table-success">{schoolSum?.total_eating}</td>
                                            <td>
                                                {schoolSum?.total_students > 0 ? (
                                                    (
                                                        (schoolSum.total_eating /
                                                            (schoolSum.total_students * 2)) *
                                                        100
                                                    ).toFixed(1) + '%'
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                /* GIAO DIỆN THỐNG KÊ THEO TUẦN */
                <div className="d-flex flex-column gap-4">
                    {/* Bảng 1: Thống kê cả trường theo từng ngày trong tuần */}
                    <div className="card border-0 shadow-sm rounded-3">
                        <div className="card-header bg-white py-3 px-3 d-flex justify-content-between align-items-center">
                            <h5 className="mb-0 fw-bold text-dark" style={{ fontSize: '1.05rem' }}>
                                <i className="fas fa-calendar-alt text-primary me-2"></i>
                                Tổng hợp số lượng suất ăn toàn trường các ngày trong tuần
                            </h5>
                            <span className="badge bg-primary px-3 py-2">
                                Tổng cả tuần: {statData?.grand_total?.total_eating || 0} suất ăn
                            </span>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-hover table-bordered align-middle mb-0 text-center">
                                <thead className="table-light">
                                    <tr>
                                        <th>Thứ / Ngày</th>
                                        <th className="table-warning text-dark">Trưa ăn (X)</th>
                                        <th className="table-warning text-dark">Trưa cắt (O)</th>
                                        <th className="table-info text-dark">Tối ăn (X)</th>
                                        <th className="table-info text-dark">Tối cắt (O)</th>
                                        <th className="table-success text-dark">Tổng suất ăn trong ngày</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statData?.daily_summaries?.map((d) => (
                                        <tr key={d.date}>
                                            <td className="fw-bold">
                                                {d.day_name} ({formatShortDate(d.date)})
                                            </td>
                                            <td className="fw-bold text-success">{d.lunch_eating}</td>
                                            <td className="text-danger">{d.lunch_cut}</td>
                                            <td className="fw-bold text-success">{d.dinner_eating}</td>
                                            <td className="text-danger">{d.dinner_cut}</td>
                                            <td className="fw-bold text-success table-success">{d.total_eating}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="table-light fw-bold">
                                    <tr>
                                        <td>TỔNG CỘNG CẢ TUẦN</td>
                                        <td className="text-success">
                                            {statData?.daily_summaries?.reduce((acc, curr) => acc + curr.lunch_eating, 0)}
                                        </td>
                                        <td className="text-danger">
                                            {statData?.daily_summaries?.reduce((acc, curr) => acc + curr.lunch_cut, 0)}
                                        </td>
                                        <td className="text-success">
                                            {statData?.daily_summaries?.reduce((acc, curr) => acc + curr.dinner_eating, 0)}
                                        </td>
                                        <td className="text-danger">
                                            {statData?.daily_summaries?.reduce((acc, curr) => acc + curr.dinner_cut, 0)}
                                        </td>
                                        <td className="text-success table-success">{statData?.grand_total?.total_eating}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Bảng 2: Ma trận chi tiết từng lớp theo từng ngày */}
                    <div className="card border-0 shadow-sm rounded-3">
                        <div className="card-header bg-white py-3 px-3">
                            <h5 className="mb-0 fw-bold text-dark" style={{ fontSize: '1.05rem' }}>
                                <i className="fas fa-th text-primary me-2"></i>
                                Ma trận số suất ăn theo từng lớp trong tuần (Trưa / Tối)
                            </h5>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-hover table-bordered align-middle mb-0 text-center table-sm" style={{ fontSize: '0.88rem' }}>
                                <thead className="table-light">
                                    <tr>
                                        <th rowSpan="2" className="text-start" style={{ minWidth: '120px' }}>Lớp</th>
                                        <th rowSpan="2">Sĩ số</th>
                                        {statData?.days?.map((dStr, idx) => (
                                            <th key={dStr} colSpan="2">
                                                {statData.day_names?.[idx]} ({formatShortDate(dStr)})
                                            </th>
                                        ))}
                                        <th rowSpan="2" className="table-success text-dark">Tổng tuần</th>
                                    </tr>
                                    <tr>
                                        {statData?.days?.map((dStr) => (
                                            <React.Fragment key={dStr}>
                                                <th className="text-success">Tr</th>
                                                <th className="text-success">T</th>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {statData?.by_class?.map((cRow) => (
                                        <tr key={cRow.class_name}>
                                            <td className="text-start fw-bold">{cRow.class_name}</td>
                                            <td>{cRow.student_count}</td>
                                            {statData?.days?.map((dStr) => {
                                                const dInfo = cRow.days?.[dStr] || { lunch_eating: 0, dinner_eating: 0 };
                                                return (
                                                    <React.Fragment key={dStr}>
                                                        <td className="text-success fw-bold">{dInfo.lunch_eating}</td>
                                                        <td className="text-success fw-bold">{dInfo.dinner_eating}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                            <td className="fw-bold text-success table-success">{cRow.total_eating}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="card-footer bg-light py-2 px-3 small text-muted">
                            Tr: Suất ăn trưa (X), T: Suất ăn tối (X). Các suất cắt (O) không được cộng vào tổng số suất ăn.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MealStats;
