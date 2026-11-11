import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const API_MEAL = apiUrl('/api/meal');

const WeeklyMenu = ({ user, roleName, mockToday, showConfirm, closeConfirm }) => {
    const isManagerOrCanteen = ['canteen_manager', 'manager', 'admin'].includes(roleName);
    const [currentDate, setCurrentDate] = useState(mockToday || new Date().toISOString().slice(0, 10));
    const [weekData, setWeekData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editDays, setEditDays] = useState([]);
    const [editWeekNote, setEditWeekNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    useEffect(() => {
        if (mockToday && !currentDate) {
            setCurrentDate(mockToday);
        }
    }, [mockToday]);

    const fetchMenu = (dateVal) => {
        setLoading(true);
        fetch(`${API_MEAL}/menu/week?date=${dateVal || currentDate}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setWeekData(data.data);
                    setEditDays(JSON.parse(JSON.stringify(data.data.days || [])));
                    setEditWeekNote(data.data.note || '');
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (currentDate) {
            fetchMenu(currentDate);
        }
    }, [currentDate]);

    // Chuyển tuần
    const changeWeek = (offsetDays) => {
        if (!weekData?.week_start) return;
        const [y, m, d] = weekData.week_start.split('-').map(Number);
        const dt = new Date(y, m - 1, d + offsetDays);
        const pad = (n) => String(n).padStart(2, '0');
        const nextDateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        setIsEditing(false);
        setSaveMessage(null);
        setCurrentDate(nextDateStr);
    };

    const goToCurrentWeek = () => {
        setIsEditing(false);
        setSaveMessage(null);
        setCurrentDate(mockToday || new Date().toISOString().slice(0, 10));
    };

    const handleEditChange = (dayIdx, mealType, field, value) => {
        const next = [...editDays];
        if (!next[dayIdx][mealType]) {
            next[dayIdx][mealType] = {};
        }
        next[dayIdx][mealType][field] = value;
        setEditDays(next);
    };

    const handleSave = () => {
        setSaving(true);
        setSaveMessage(null);
        fetch(`${API_MEAL}/menu/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user?.username || '',
                role_name: roleName,
                week_start: weekData?.week_start,
                note: editWeekNote,
                days: editDays
            })
        })
            .then(res => res.json())
            .then(data => {
                setSaving(false);
                if (data.success) {
                    setSaveMessage({ type: 'success', text: 'Đã lưu thực đơn thành công!' });
                    setIsEditing(false);
                    fetchMenu(currentDate);
                    setTimeout(() => setSaveMessage(null), 3000);
                } else {
                    setSaveMessage({ type: 'danger', text: data.message || 'Lỗi lưu thực đơn.' });
                }
            })
            .catch(() => {
                setSaving(false);
                setSaveMessage({ type: 'danger', text: 'Lỗi kết nối máy chủ.' });
            });
    };

    const handleCopyPrevious = () => {
        if (!weekData?.week_start) return;
        showConfirm(
            'Sao chép thực đơn tuần trước',
            `Bạn có chắc chắn muốn sao chép toàn bộ thực đơn từ tuần trước sang tuần ${weekData.week_start.split('-').reverse().join('/')}? Các món ăn hiện tại của tuần này sẽ được ghi đè.`,
            () => {
                closeConfirm();
                setLoading(true);
                fetch(`${API_MEAL}/menu/copy-previous-week`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week_start: weekData.week_start,
                        username: user?.username || 'canteen_manager',
                        role_name: roleName
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        setLoading(false);
                        if (data.success) {
                            setSaveMessage({ type: 'success', text: data.message });
                            setIsEditing(false);
                            fetchMenu(currentDate);
                            setTimeout(() => setSaveMessage(null), 3500);
                        } else {
                            showConfirm('Không thể sao chép', data.message || 'Có lỗi xảy ra', closeConfirm, 'error');
                        }
                    })
                    .catch(() => {
                        setLoading(false);
                        showConfirm('Lỗi kết nối', 'Không thể kết nối đến máy chủ.', closeConfirm, 'error');
                    });
            }
        );
    };

    const formatShortDate = (dStr) => {
        if (!dStr) return '';
        const parts = dStr.split('-');
        return `${parts[2]}/${parts[1]}`;
    };

    return (
        <div>
            {/* Header điều hướng tuần & nút thao tác */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 bg-white p-3 rounded shadow-sm">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => changeWeek(-7)}
                        title="Tuần trước"
                    >
                        <i className="fas fa-chevron-left me-1"></i> Tuần trước
                    </button>
                    <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={goToCurrentWeek}
                    >
                        Tuần này
                    </button>
                    <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => changeWeek(7)}
                        title="Tuần sau"
                    >
                        Tuần sau <i className="fas fa-chevron-right ms-1"></i>
                    </button>
                    {weekData && (
                        <span className="ms-2 fw-bold text-primary" style={{ fontSize: '1rem' }}>
                            <i className="fas fa-calendar-alt me-1"></i>
                            {formatShortDate(weekData.week_start)} - {formatShortDate(weekData.week_end)}/{weekData.week_start.slice(0, 4)}
                        </span>
                    )}
                </div>

                <div className="d-flex align-items-center gap-2">
                    {isManagerOrCanteen && !isEditing && (
                        <>
                            <button
                                className="btn btn-outline-info btn-sm"
                                onClick={handleCopyPrevious}
                                title="Sao chép thực đơn tuần trước"
                            >
                                <i className="fas fa-copy me-1"></i> Sao chép từ tuần trước
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                    setEditDays(JSON.parse(JSON.stringify(weekData?.days || [])));
                                    setEditWeekNote(weekData?.note || '');
                                    setIsEditing(true);
                                }}
                            >
                                <i className="fas fa-edit me-1"></i> Chỉnh sửa thực đơn
                            </button>
                        </>
                    )}
                    {isManagerOrCanteen && isEditing && (
                        <>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditDays(JSON.parse(JSON.stringify(weekData?.days || [])));
                                }}
                                disabled={saving}
                            >
                                Hủy bỏ
                            </button>
                            <button
                                className="btn btn-success btn-sm fw-bold"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <><i className="fas fa-spinner fa-spin me-1"></i> Đang lưu...</>
                                ) : (
                                    <><i className="fas fa-check me-1"></i> Lưu thực đơn tuần</>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {saveMessage && (
                <div className={`alert alert-${saveMessage.type} py-2 px-3 mb-3 d-flex align-items-center justify-content-between`}>
                    <span>{saveMessage.text}</span>
                    <button type="button" className="btn-close" onClick={() => setSaveMessage(null)}></button>
                </div>
            )}

            {isEditing && (
                <div className="bg-white p-3 rounded shadow-sm mb-3">
                    <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center gap-2">
                        <i className="fas fa-info-circle text-warning fs-5"></i>
                        <span>
                            <strong>Chế độ tạo & chỉnh sửa thực đơn:</strong> Nhập các món ăn, đơn giá và tiêu chuẩn dinh dưỡng cho từng bữa. Bấm &quot;Lưu thực đơn tuần&quot; sau khi hoàn tất.
                        </span>
                    </div>
                    <div>
                        <label className="form-label small fw-bold text-muted mb-1">Ghi chú chung thực đơn tuần</label>
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="VD: Tuần tăng cường rau xanh, đảm bảo đủ định lượng..."
                            value={editWeekNote}
                            onChange={(e) => setEditWeekNote(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {!isEditing && weekData?.note && (
                <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center gap-2">
                    <i className="fas fa-sticky-note"></i>
                    <span><strong>Ghi chú tuần:</strong> {weekData.note}</span>
                </div>
            )}

            {loading ? (
                <div className="text-center py-5 bg-white rounded shadow-sm">
                    <i className="fas fa-spinner fa-spin fa-2x text-primary mb-2"></i>
                    <p className="text-muted">Đang tải thực đơn tuần...</p>
                </div>
            ) : !isEditing ? (
                /* CHẾ ĐỘ XEM THỰC ĐƠN TUẦN */
                <div className="row g-3">
                    {weekData?.days?.map((day) => {
                        const hasLunch = day.lunch && (day.lunch.main_dish_1 || day.lunch.soup);
                        const hasDinner = day.dinner && (day.dinner.main_dish_1 || day.dinner.soup);

                        return (
                            <div key={day.date} className="col-12 col-lg-6 col-xl-4">
                                <div
                                    className={`card h-100 shadow-sm border-0 ${day.is_today ? 'border-top border-4 border-primary' : ''}`}
                                    style={{ borderRadius: '10px', overflow: 'hidden' }}
                                >
                                    {/* Header Ngày */}
                                    <div
                                        className={`card-header py-2 px-3 d-flex justify-content-between align-items-center ${
                                            day.is_today ? 'bg-primary text-white' : 'bg-light text-dark'
                                        }`}
                                    >
                                        <div className="d-flex align-items-center gap-2">
                                            <span className="fw-bold">{day.day_name}</span>
                                            <span className={day.is_today ? 'text-white-50' : 'text-muted'}>
                                                ({formatShortDate(day.date)})
                                            </span>
                                        </div>
                                        {day.is_today && (
                                            <span className="badge bg-warning text-dark px-2 py-1">Hôm nay</span>
                                        )}
                                    </div>

                                    {/* Nội dung 2 bữa */}
                                    <div className="card-body p-3 d-flex flex-column gap-3">
                                        {/* Bữa trưa */}
                                        <div className="p-2 rounded bg-light" style={{ borderLeft: '4px solid #ff9800' }}>
                                            <div className="d-flex align-items-center justify-content-between mb-2">
                                                <span className="fw-bold text-dark" style={{ fontSize: '0.95rem' }}>
                                                    <i className="fas fa-sun text-warning me-1"></i> Bữa Trưa (11:30)
                                                </span>
                                            </div>
                                            {hasLunch ? (
                                                <ul className="list-unstyled mb-0 small" style={{ lineHeight: '1.7' }}>
                                                    <li>
                                                        <i className="fas fa-bowl-rice text-secondary me-2"></i>
                                                        <strong>Cơm:</strong> {day.lunch.rice || 'Cơm trắng'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-drumstick-bite text-danger me-2"></i>
                                                        <strong>Món mặn 1:</strong> {day.lunch.main_dish_1 || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-fish text-primary me-2"></i>
                                                        <strong>Món mặn 2:</strong> {day.lunch.main_dish_2 || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-carrot text-success me-2"></i>
                                                        <strong>Món rau:</strong> {day.lunch.side_dish || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-mug-hot text-info me-2"></i>
                                                        <strong>Món canh:</strong> {day.lunch.soup || '-'}
                                                    </li>
                                                    {day.lunch.dessert && (
                                                        <li>
                                                            <i className="fas fa-apple-whole text-warning me-2"></i>
                                                            <strong>Tráng miệng:</strong> {day.lunch.dessert}
                                                        </li>
                                                    )}
                                                    <li className="mt-1 pt-1 border-top text-muted">
                                                        <i className="fas fa-coins text-warning me-2"></i>
                                                        <strong>Đơn giá:</strong> {Number(day.lunch.meal_price || 0).toLocaleString('vi-VN')} đ
                                                        {day.lunch.nutritional_standard && (
                                                            <> | <i className="fas fa-heart-pulse text-danger mx-1"></i>{day.lunch.nutritional_standard}</>
                                                        )}
                                                    </li>
                                                </ul>
                                            ) : (
                                                <div className="text-muted small fst-italic py-2 text-center">
                                                    Chưa cập nhật thực đơn
                                                </div>
                                            )}
                                        </div>

                                        {/* Bữa tối */}
                                        <div className="p-2 rounded bg-light" style={{ borderLeft: '4px solid #3f51b5' }}>
                                            <div className="d-flex align-items-center justify-content-between mb-2">
                                                <span className="fw-bold text-dark" style={{ fontSize: '0.95rem' }}>
                                                    <i className="fas fa-moon text-primary me-1"></i> Bữa Tối (18:00)
                                                </span>
                                            </div>
                                            {hasDinner ? (
                                                <ul className="list-unstyled mb-0 small" style={{ lineHeight: '1.7' }}>
                                                    <li>
                                                        <i className="fas fa-bowl-rice text-secondary me-2"></i>
                                                        <strong>Cơm:</strong> {day.dinner.rice || 'Cơm trắng'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-drumstick-bite text-danger me-2"></i>
                                                        <strong>Món mặn 1:</strong> {day.dinner.main_dish_1 || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-fish text-primary me-2"></i>
                                                        <strong>Món mặn 2:</strong> {day.dinner.main_dish_2 || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-carrot text-success me-2"></i>
                                                        <strong>Món rau:</strong> {day.dinner.side_dish || '-'}
                                                    </li>
                                                    <li>
                                                        <i className="fas fa-mug-hot text-info me-2"></i>
                                                        <strong>Món canh:</strong> {day.dinner.soup || '-'}
                                                    </li>
                                                    {day.dinner.dessert && (
                                                        <li>
                                                            <i className="fas fa-apple-whole text-warning me-2"></i>
                                                            <strong>Tráng miệng:</strong> {day.dinner.dessert}
                                                        </li>
                                                    )}
                                                    <li className="mt-1 pt-1 border-top text-muted">
                                                        <i className="fas fa-coins text-warning me-2"></i>
                                                        <strong>Đơn giá:</strong> {Number(day.dinner.meal_price || 0).toLocaleString('vi-VN')} đ
                                                        {day.dinner.nutritional_standard && (
                                                            <> | <i className="fas fa-heart-pulse text-danger mx-1"></i>{day.dinner.nutritional_standard}</>
                                                        )}
                                                    </li>
                                                </ul>
                                            ) : (
                                                <div className="text-muted small fst-italic py-2 text-center">
                                                    Chưa cập nhật thực đơn
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* CHẾ ĐỘ CHỈNH SỬA THỰC ĐƠN TUẦN */
                <div className="d-flex flex-column gap-3">
                    {editDays.map((day, idx) => (
                        <div key={day.date} className="card shadow-sm border-0" style={{ borderRadius: '8px' }}>
                            <div className="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center">
                                <span className="fw-bold text-primary">
                                    {day.day_name} ({formatShortDate(day.date)})
                                </span>
                                {day.is_today && <span className="badge bg-warning text-dark">Hôm nay</span>}
                            </div>
                            <div className="card-body p-3">
                                <div className="row g-3">
                                    {/* Form Bữa Trưa */}
                                    <div className="col-12 col-md-6 border-end">
                                        <div className="d-flex align-items-center gap-1 mb-2">
                                            <i className="fas fa-sun text-warning"></i>
                                            <span className="fw-bold text-dark">Bữa Trưa</span>
                                        </div>
                                        <div className="row g-2">
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Cơm</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.rice || ''}
                                                    placeholder="Cơm trắng / Cơm tám..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'rice', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món mặn 1 *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.main_dish_1 || ''}
                                                    placeholder="Thịt kho tàu..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'main_dish_1', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món mặn 2 *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.main_dish_2 || ''}
                                                    placeholder="Cá sốt cà..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'main_dish_2', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món rau (1 rau) *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.side_dish || ''}
                                                    placeholder="Rau muống xào tỏi..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'side_dish', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món canh (1 canh) *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.soup || ''}
                                                    placeholder="Canh cua mồng tơi..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'soup', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Tráng miệng</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.dessert || ''}
                                                    placeholder="Dưa hấu / Chuối..."
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'dessert', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Đơn giá (VNĐ)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1000"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.meal_price ?? 25000}
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'meal_price', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Tiêu chuẩn dinh dưỡng</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.lunch?.nutritional_standard || ''}
                                                    placeholder="Đủ 5 nhóm chất (~750 kcal)"
                                                    onChange={(e) => handleEditChange(idx, 'lunch', 'nutritional_standard', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Bữa Tối */}
                                    <div className="col-12 col-md-6">
                                        <div className="d-flex align-items-center gap-1 mb-2">
                                            <i className="fas fa-moon text-primary"></i>
                                            <span className="fw-bold text-dark">Bữa Tối</span>
                                        </div>
                                        <div className="row g-2">
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Cơm</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.rice || ''}
                                                    placeholder="Cơm trắng / Cơm dẻo..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'rice', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món mặn 1 *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.main_dish_1 || ''}
                                                    placeholder="Gà kho sả..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'main_dish_1', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món mặn 2 *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.main_dish_2 || ''}
                                                    placeholder="Trứng chiên thịt..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'main_dish_2', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món rau (1 rau) *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.side_dish || ''}
                                                    placeholder="Bắp cải xào..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'side_dish', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Món canh (1 canh) *</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.soup || ''}
                                                    placeholder="Canh chua cá..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'soup', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Tráng miệng</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.dessert || ''}
                                                    placeholder="Sữa chua / Trái cây..."
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'dessert', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Đơn giá (VNĐ)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1000"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.meal_price ?? 25000}
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'meal_price', e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 col-sm-6">
                                                <label className="form-label small text-muted mb-1">Tiêu chuẩn dinh dưỡng</label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={day.dinner?.nutritional_standard || ''}
                                                    placeholder="Đủ 5 nhóm chất (~750 kcal)"
                                                    onChange={(e) => handleEditChange(idx, 'dinner', 'nutritional_standard', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="d-flex justify-content-end gap-2 mt-3 pb-4">
                        <button
                            className="btn btn-secondary"
                            onClick={() => setIsEditing(false)}
                            disabled={saving}
                        >
                            Hủy bỏ
                        </button>
                        <button
                            className="btn btn-success px-4 fw-bold"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <><i className="fas fa-spinner fa-spin me-1"></i> Đang lưu...</>
                            ) : (
                                <><i className="fas fa-check me-1"></i> Lưu toàn bộ thực đơn tuần</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeeklyMenu;
