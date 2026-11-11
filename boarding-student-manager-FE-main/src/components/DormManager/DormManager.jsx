// import React, { useEffect, useState } from 'react';

// const DormManager = () => {
//     const [dormrooms, setDormrooms] = useState([]);
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         fetch('http://localhost:5000/api/dormroom/')
//             .then(res => res.json())
//             .then(data => {
//                 if (data.success) {
//                     setDormrooms(data.data);
//                 }
//                 setLoading(false);
//             })
//             .catch(err => {
//                 console.error(err);
//                 setLoading(false);
//             });
//     }, []);

//     if (loading) return <div>Ã„Âang tÃ¡ÂºÂ£i danh sÃƒÂ¡ch phÃƒÂ²ng...</div>;

//     return (
//         <div style={{ padding: '20px' }}>
//             <h2 style={{ color: '#00206d', marginBottom: '20px' }}>QuÃ¡ÂºÂ£n lÃƒÂ½ PhÃƒÂ²ng Ã¡Â»Å¸</h2>
//             <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
//                 <div style={{ marginBottom: '15px' }}>
//                     <button className="btn btn-primary" style={{ background: '#00206d', borderColor: '#00206d' }}>
//                         <i className="fas fa-plus"></i> ThÃƒÂªm phÃƒÂ²ng mÃ¡Â»â€ºi
//                     </button>
//                 </div>
//                 <table className="table table-striped table-hover">
//                     <thead style={{ background: '#00206d', color: '#fff' }}>
//                         <tr>
//                             <th>MÃƒÂ£ phÃƒÂ²ng</th>
//                             <th>TÃƒÂªn phÃƒÂ²ng</th>
//                             <th>SÃ¡Â»â€˜ giÃ†Â°Ã¡Â»Âng</th>
//                             <th>Thao tÃƒÂ¡c</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {dormrooms.map(room => (
//                             <tr key={room.id}>
//                                 <td>{room.id}</td>
//                                 <td>{room.name}</td>
//                                 <td>{room.num_of_bed}</td>
//                                 <td>
//                                     <button className="btn btn-sm btn-info me-2"><i className="fas fa-edit"></i></button>
//                                     <button className="btn btn-sm btn-danger"><i className="fas fa-trash"></i></button>
//                                 </td>
//                             </tr>
//                         ))}
//                         {dormrooms.length === 0 && (
//                             <tr>
//                                 <td colSpan="4" className="text-center">KhÃƒÂ´ng cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u</td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };

// export default DormManager;


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import { getStoredUser, getUserRole } from '../../config/auth';
import ConfirmModal from '../common/ConfirmModal';

const API_DORMROOM = apiUrl('/api/dormroom');

const emptyRoomForm = { id: '', name: '', num_of_bed: '' };

const importConfigs = {
    rooms: {
        title: 'Nhập danh sách phòng ở từ Excel',
        endpoint: `${API_DORMROOM}/upload`,
        template: `${API_DORMROOM}/template`,
        sample: 'Mã phòng (id), Tên phòng (name), Số giường (num_of_bed)'
    },
    living: {
        title: 'Nhập học sinh vào phòng ở từ Excel',
        endpoint: `${API_DORMROOM}/upload-living`,
        template: `${API_DORMROOM}/living-template`,
        sample: 'Mã học sinh (id_student), Mã phòng (id_dormroom), Ngày xếp phòng (import_date), Ghi chú (note)'
    }
};

const splitRoomCode = (roomId = '') => {
    const text = String(roomId);
    const letters = text.replace(/[0-9]/g, '').toLowerCase();
    const digits = text.replace(/\D/g, '');
    return { letters, number: digits ? Number(digits) : 0, raw: text.toLowerCase() };
};

const compareRoomCode = (a, b) => {
    const left = splitRoomCode(a.id);
    const right = splitRoomCode(b.id);
    if (left.letters !== right.letters) return left.letters.localeCompare(right.letters, 'vi');
    if (left.number !== right.number) return left.number - right.number;
    return left.raw.localeCompare(right.raw, 'vi');
};

const getRoomBuilding = (roomName = '') => {
    const text = String(roomName || '').trim();
    if (!text) return '';
    const match = text.match(/^[^\d]+/);
    return (match ? match[0] : '').trim().toUpperCase();
};

const DormManager = () => {
    const navigate = useNavigate();
    const [dormrooms, setDormrooms] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadType, setUploadType] = useState('rooms');
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadDuplicates, setUploadDuplicates] = useState([]);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const fileInputRef = useRef(null);

    const [showRoomForm, setShowRoomForm] = useState(false);
    const [roomForm, setRoomForm] = useState(emptyRoomForm);
    const [roomFormError, setRoomFormError] = useState('');
    const [savingRoom, setSavingRoom] = useState(false);
    const [editingRoomId, setEditingRoomId] = useState('');
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const [bulkActionModal, setBulkActionModal] = useState({ show: false, action: 'DELETE_ROOM' });
    const [managerActionRoom, setManagerActionRoom] = useState(null);

    const [selectedRoom, setSelectedRoom] = useState(null);
    const [roomStudents, setRoomStudents] = useState([]);
    const [roomLoading, setRoomLoading] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [roomFilter, setRoomFilter] = useState('');
    const [buildingFilter, setBuildingFilter] = useState('');
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [selectedRoomIds, setSelectedRoomIds] = useState([]);
    const [assigning, setAssigning] = useState(false);
    const [assignResult, setAssignResult] = useState(null);
    const [transferConfirm, setTransferConfirm] = useState({ show: false, students: [] });

    const user = getStoredUser() || {};
    const roleName = getUserRole(user);
    const isTeacher = roleName === 'teacher';
    const isManager = roleName === 'manager' || roleName === 'dorm_manager';
    const teacherQuery = isTeacher && user.username
        ? `?teacher_id=${encodeURIComponent(user.username)}`
        : '';

    const [activeTab, setActiveTab] = useState('rooms');
    const [changeRequests, setChangeRequests] = useState([]);
    const [inspFilter, setInspFilter] = useState('today'); // 'today' or 'week'
    const [inspDate, setInspDate] = useState(new Date().toISOString().slice(0, 10));
    const [roomInspData, setRoomInspData] = useState(null);
    const [roomInspLoading, setRoomInspLoading] = useState(false);
    const [roomViolationRange, setRoomViolationRange] = useState('week');
    const [roomViolationsData, setRoomViolationsData] = useState(null);
    const [roomViolationsLoading, setRoomViolationsLoading] = useState(false);

    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));

    const sortedDormrooms = useMemo(() => [...dormrooms].sort(compareRoomCode), [dormrooms]);
    const buildingOptions = useMemo(() => (
        [...new Set(dormrooms.map(room => getRoomBuilding(room.name)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
    ), [dormrooms]);

    const duplicateGroups = useMemo(() => {
        const groups = {};
        uploadDuplicates.forEach(item => {
            const blk = item.block || 'Khác';
            if (!groups[blk]) groups[blk] = [];
            groups[blk].push(item);
        });
        return groups;
    }, [uploadDuplicates]);
    const filteredDormrooms = useMemo(() => (
        sortedDormrooms.filter(room => !buildingFilter || getRoomBuilding(room.name) === buildingFilter)
    ), [sortedDormrooms, buildingFilter]);

    const fetchDormrooms = useCallback(() => {
        setLoading(true);
        fetch(`${API_DORMROOM}/${teacherQuery}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setDormrooms(data.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [teacherQuery]);

    const fetchStudents = useCallback(() => {
        fetch(`${API_DORMROOM}/students-overview${teacherQuery}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setStudents(data.data);
            })
            .catch(console.error);
    }, [teacherQuery]);

    const refreshData = useCallback(() => {
        fetchDormrooms();
        fetchStudents();
    }, [fetchDormrooms, fetchStudents]);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    const fetchRoomInsp = useCallback((roomId, filter, dateStr) => {
        setRoomInspLoading(true);
        const url = filter === 'today' 
            ? apiUrl(`/api/inspection/?room_id=${roomId}&date=${dateStr}`)
            : apiUrl(`/api/inspection/summary/weekly?date=${dateStr}`);
        fetch(url).then(r=>r.json()).then(d=>{
            if (d.success) {
                if (filter === 'today') {
                    setRoomInspData(d.data && d.data.length ? d.data[0] : null);
                } else {
                    const roomSum = d.data.find(x => x.summary_type === 'ROOM' && x.ref_id === roomId);
                    setRoomInspData(roomSum || null);
                }
            } else setRoomInspData(null);
            setRoomInspLoading(false);
        }).catch(()=>setRoomInspLoading(false));
    }, []);

    const fetchRoomViolations = useCallback((roomId, range, dateStr) => {
        if (!roomId) return;
        setRoomViolationsLoading(true);
        const params = new URLSearchParams({
            range,
            date: dateStr,
            role_name: roleName,
            username: user.username || ''
        });
        fetch(apiUrl(`/api/inspection/room/${roomId}/violations?${params.toString()}`))
            .then(res => res.json())
            .then(data => {
                if (data.success) setRoomViolationsData(data.data);
                else setRoomViolationsData(null);
                setRoomViolationsLoading(false);
            })
            .catch(() => {
                setRoomViolationsData(null);
                setRoomViolationsLoading(false);
            });
    }, [roleName, user.username]);

    const fetchRoomStudents = useCallback((roomId) => {
        setRoomLoading(true);
        fetch(`${API_DORMROOM}/${roomId}/students${teacherQuery}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setSelectedRoom(data.data.room);
                    setRoomStudents(data.data.students);
                }
                setRoomLoading(false);
            })
            .catch(() => setRoomLoading(false));
            
        fetchRoomInsp(roomId, inspFilter, inspDate);
        fetchRoomViolations(roomId, roomViolationRange, inspDate);
    }, [teacherQuery, fetchRoomInsp, fetchRoomViolations, inspFilter, inspDate, roomViolationRange]);

    useEffect(() => {
        if (selectedRoom) fetchRoomInsp(selectedRoom.id, inspFilter, inspDate);
    }, [selectedRoom, fetchRoomInsp, inspFilter, inspDate]);

    useEffect(() => {
        if (selectedRoom) fetchRoomViolations(selectedRoom.id, roomViolationRange, inspDate);
    }, [selectedRoom, fetchRoomViolations, roomViolationRange, inspDate]);

    const fetchRequests = useCallback(() => {
        let url = `${API_DORMROOM}/requests`;
        if (isTeacher) url += `?teacher_id=${encodeURIComponent(user.username || '')}`;
        fetch(url).then(r=>r.json()).then(d=>{
            if(d.success) setChangeRequests(d.data);
        });
    }, [isTeacher, user.username]);

    useEffect(() => {
        if (activeTab === 'requests') fetchRequests();
    }, [activeTab, fetchRequests]);

    const refreshRoom = useCallback(() => {
        refreshData();
        if (selectedRoom) fetchRoomStudents(selectedRoom.id);
    }, [fetchRoomStudents, refreshData, selectedRoom]);

    const openRoom = (room) => {
        setSelectedRoom(room);
        setRoomStudents([]);
        setSelectedStudentIds([]);
        setStudentSearch('');
        setClassFilter('');
        setRoomFilter('');
        setAssignResult(null);
        fetchRoomStudents(room.id);
    };

    const openUploadModal = (type) => {
        setUploadType(type);
        setSelectedFile(null);
        setUploadResult(null);
        setDragOver(false);
        setShowUploadModal(true);
    };

    const toggleRoomSelection = (roomId) => {
        setSelectedRoomIds(prev =>
            prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
        );
    };

    const toggleAllRooms = (checked) => {
        setSelectedRoomIds(checked ? filteredDormrooms.map(room => room.id) : []);
    };

    const openBulkActionModal = () => {
        const selectedRooms = filteredDormrooms.filter(room => selectedRoomIds.includes(room.id));
        if (selectedRooms.length === 0) return;
        setBulkActionModal({ show: true, action: 'DELETE_ROOM' });
    };

    const handleBulkAction = () => {
        const selectedRooms = filteredDormrooms.filter(room => selectedRoomIds.includes(room.id));
        if (selectedRooms.length === 0) return;
        setBulkActionModal(prev => ({ ...prev, show: false }));
        
        const requests = selectedRooms.map(room => {
            if (isTeacher) {
                return fetch(`${API_DORMROOM}/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_teacher: user.username,
                        id_dormroom: room.id,
                        action: bulkActionModal.action
                    })
                }).then(res => res.json());
            }
            if (bulkActionModal.action === 'CLEAR_STUDENTS') {
                return fetch(`${API_DORMROOM}/${room.id}/students`, { method: 'DELETE' }).then(res => res.json());
            }
            return fetch(`${API_DORMROOM}/${room.id}`, { method: 'DELETE' }).then(res => res.json());
        });

        Promise.all(requests)
            .then(results => {
                const failed = results.filter(result => !result.success);
                if (failed.length === 0) {
                    showAlert(isTeacher ? 'Đã gửi yêu cầu' : 'Thành công', isTeacher ? 'Đã gửi yêu cầu xử lý các phòng đã chọn cho manager.' : 'Đã xử lý các phòng đã chọn.');
                    setSelectedRoomIds([]);
                    refreshData();
                    fetchRequests();
                    if (isTeacher) setActiveTab('requests');
                } else {
                    showAlert('Lỗi', `Có ${failed.length} phòng xử lý lỗi.`);
                }
            })
            .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
    };

    const selectCsvFile = (file) => {
        if (!file) return;
        const name = file.name.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
            setUploadResult({ success: false, message: 'Chỉ hỗ trợ file Excel (.xlsx, .xls) hoặc CSV' });
            return;
        }
        setSelectedFile(file);
        setUploadResult(null);
    };

    const handleUpload = () => {
        if (!selectedFile) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);

        fetch(importConfigs[uploadType].endpoint, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                setUploading(false);
                if (data.success) {
                    setSelectedFile(null);
                    refreshRoom();
                    if (data.duplicates && data.duplicates.length > 0) {
                        setUploadDuplicates(data.duplicates);
                        setShowDuplicateModal(true);
                        setShowUploadModal(false);
                    } else {
                        setUploadResult({ success: true, message: data.message });
                    }
                } else {
                    setUploadResult({ success: false, message: data.message || data.error });
                }
            })
            .catch(() => {
                setUploading(false);
                setUploadResult({ success: false, message: 'Lỗi kết nối server' });
            });
    };

    const openCreateRoomForm = () => {
        setEditingRoomId('');
        setRoomForm(emptyRoomForm);
        setRoomFormError('');
        setShowRoomForm(true);
    };

    const openEditRoomForm = (room) => {
        setEditingRoomId(room.id);
        setSelectedRoom(room);
        setRoomStudents([]);
        setSelectedStudentIds([]);
        setStudentSearch('');
        setClassFilter('');
        setRoomFilter('');
        setAssignResult(null);
        setRoomForm({
            id: room.id || '',
            name: room.name || '',
            num_of_bed: room.num_of_bed ?? ''
        });
        setRoomFormError('');
        setShowRoomForm(true);
        fetchRoomStudents(room.id);
    };

    const handleDeleteRoom = (room) => {
        if (isManager) {
            setManagerActionRoom(room);
            return;
        }

        showConfirm('Xác nhận xoá', `Bạn có chắc muốn yêu cầu xoá tất cả học sinh mà bạn đang quản lý khỏi phòng ${room.name}?`, () => {
            closeConfirm();
            fetch(`${API_DORMROOM}/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_teacher: user.username,
                    id_dormroom: room.id,
                    action: 'CLEAR_STUDENTS'
                })
            }).then(res => res.json()).then(data => {
                showAlert(data.success ? 'Đã gửi yêu cầu' : 'Lỗi', data.message || data.error || 'Không thể gửi yêu cầu');
                if (data.success) {
                    fetchRequests();
                    setActiveTab('requests');
                }
            }).catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
        });
    };

    const executeManagerRoomAction = (action) => {
        const room = managerActionRoom;
        setManagerActionRoom(null);
        showConfirm('Xác nhận', `Bạn có chắc muốn ${action === 'DELETE_ROOM' ? 'xoá phòng' : 'xoá tất cả học sinh trong phòng'} ${room.name}?`, () => {
            closeConfirm();
            if (action === 'DELETE_ROOM') {
                fetch(`${API_DORMROOM}/${room.id}`, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(data => {
                        showAlert(data.success ? 'Thành công' : 'Lỗi', data.message || data.error || 'Không thể xoá phòng');
                        if (data.success) {
                            if (selectedRoom?.id === room.id) setSelectedRoom(null);
                            refreshData();
                        }
                    })
                    .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
            } else {
                fetch(`${API_DORMROOM}/${room.id}/students`, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(data => {
                        showAlert(data.success ? 'Thành công' : 'Lỗi', data.message || data.error || 'Không thể xoá học sinh');
                        if (data.success) {
                            if (selectedRoom?.id === room.id) fetchRoomStudents(room.id);
                            refreshData();
                        }
                    })
                    .catch(() => showAlert('Lỗi', 'Lỗi kết nối server'));
            }
        }, 'danger');
    };

    const handleSaveRoom = (e) => {
        e.preventDefault();
        setSavingRoom(true);
        setRoomFormError('');

        const payload = {
            id: roomForm.id.trim(),
            name: roomForm.name.trim(),
            num_of_bed: roomForm.num_of_bed === '' ? null : Number(roomForm.num_of_bed)
        };

        if (editingRoomId && isTeacher) {
            fetch(`${API_DORMROOM}/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_teacher: user.username,
                    id_dormroom: editingRoomId,
                    action: 'EDIT_ROOM',
                    name: payload.name,
                    num_of_bed: payload.num_of_bed
                })
            })
                .then(res => res.json())
                .then(data => {
                    setSavingRoom(false);
                    if (data.success) {
                        setShowRoomForm(false);
                        setEditingRoomId('');
                        setSelectedRoom(null);
                        setRoomForm(emptyRoomForm);
                        showAlert('Đã gửi yêu cầu', 'Yêu cầu chỉnh sửa phòng đã được gửi cho manager.');
                        fetchRequests();
                    } else {
                        setRoomFormError(data.error || data.message || 'Không thể gửi yêu cầu');
                    }
                })
                .catch((err) => {
                    console.error("Save Room Error:", err);
                    setSavingRoom(false);
                    setRoomFormError('Lỗi kết nối server');
                });
            return;
        }

        fetch(editingRoomId ? `${API_DORMROOM}/${editingRoomId}` : `${API_DORMROOM}/`, {
            method: editingRoomId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                setSavingRoom(false);
                if (data.success) {
                    setShowRoomForm(false);
                    setEditingRoomId('');
                    setSelectedRoom(null);
                    setRoomForm(emptyRoomForm);
                    refreshRoom();
                } else {
                    setRoomFormError(data.error || data.message || 'Không thể lưu phòng');
                }
            })
            .catch((err) => {
                console.error("Save Room Error:", err);
                setSavingRoom(false);
                setRoomFormError('Lỗi kết nối server');
            });
    };

    const toggleStudent = (studentId) => {
        setSelectedStudentIds(prev =>
            prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
        );
    };

    const performAssignStudentsToRoom = () => {
        if (!selectedRoom || selectedStudentIds.length === 0) return;
        setAssigning(true);
        setAssignResult(null);

        if (isTeacher) {
            Promise.all(selectedStudentIds.map(studentId => 
                fetch(`${API_DORMROOM}/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_teacher: user.username,
                        id_student: studentId,
                        id_dormroom: selectedRoom.id,
                        action: 'ADD'
                    })
                }).then(r => r.json())
            )).then(results => {
                setAssigning(false);
                const fails = results.filter(r => !r.success);
                if (fails.length === 0) {
                    setAssignResult({ success: true, message: 'Đã gửi yêu cầu thêm học sinh' });
                    setSelectedStudentIds([]);
                    fetchRequests();
                    setActiveTab('requests');
                } else {
                    setAssignResult({ success: false, message: `Có ${fails.length} yêu cầu lỗi` });
                }
            }).catch(() => {
                setAssigning(false);
                setAssignResult({ success: false, message: 'Lỗi kết nối server' });
            });
        } else {
            fetch(`${API_DORMROOM}/${selectedRoom.id}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_ids: selectedStudentIds })
            })
                .then(res => res.json())
                .then(data => {
                    setAssigning(false);
                    setAssignResult({ success: data.success, message: data.message || data.error });
                    if (data.success) {
                        setSelectedStudentIds([]);
                        refreshRoom();
                    }
                })
                .catch(() => {
                    setAssigning(false);
                    setAssignResult({ success: false, message: 'Lỗi kết nối server' });
                });
        }
    };

    const assignStudentsToRoom = () => {
        if (!selectedRoom || selectedStudentIds.length === 0) return;
        
        const existingGenders = new Set(roomStudents.map(s => String(s.sex ?? '').toLowerCase().trim()));
        const selectedGenders = new Set(selectableStudents.filter(s => selectedStudentIds.includes(s.id_VNeID)).map(s => String(s.sex ?? '').toLowerCase().trim()));
        
        const continueAssignment = () => {
            const occupiedStudents = selectableStudents.filter(
                student => selectedStudentIds.includes(student.id_VNeID) && student.current_room_id && student.current_room_id !== selectedRoom.id
            );
            if (occupiedStudents.length > 0) {
                setTransferConfirm({ show: true, students: occupiedStudents });
                return;
            }
            performAssignStudentsToRoom();
        };

        if (existingGenders.size > 0 && selectedGenders.size > 0) {
            const isConflict = [...selectedGenders].some(g => !existingGenders.has(g)) || existingGenders.size > 1;
            if (isConflict) {
                showConfirm("Cảnh báo giới tính", "Học sinh được chọn có giới tính khác với học sinh đang ở trong phòng. Bạn có chắc chắn muốn thêm?", () => {
                    closeConfirm();
                    continueAssignment();
                }, 'warning');
                return;
            }
        } else if (selectedGenders.size > 1) {
            showConfirm("Cảnh báo giới tính", "Danh sách học sinh được chọn có nhiều giới tính khác nhau. Bạn có chắc chắn muốn thêm?", () => {
                closeConfirm();
                continueAssignment();
            }, 'warning');
            return;
        }

        continueAssignment();
    };

    const handleRemoveStudent = (studentId) => {
        showConfirm('Xác nhận', 'Bạn muốn xoá học sinh này khỏi phòng?', () => {
            closeConfirm();
            if (isTeacher) {
                fetch(`${API_DORMROOM}/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_teacher: user.username,
                        id_student: studentId,
                        id_dormroom: selectedRoom.id,
                        action: 'REMOVE'
                    })
                }).then(r => r.json()).then(d => {
                    if (d.success) {
                        showAlert('Thành công', 'Đã gửi yêu cầu xoá');
                        fetchRequests();
                        setActiveTab('requests');
                    }
                    else showAlert('Lỗi', d.message || 'Lỗi gửi yêu cầu');
                });
            } else {
                fetch(`${API_DORMROOM}/${selectedRoom.id}/students/${studentId}`, {
                    method: 'DELETE'
                }).then(r => r.json()).then(d => {
                    if (d.success) refreshRoom();
                    else showAlert('Lỗi', d.message || d.error);
                }).catch(err => {
                    console.error(err);
                    showAlert('Lỗi', 'Lỗi kết nối server');
                });
            }
        });
    };

    const handleUpdateRequest = (id, newStatus, requestType) => {
        showConfirm('Xác nhận', `Bạn muốn ${newStatus === 'APPROVED' ? 'duyệt' : 'từ chối'} yêu cầu này?`, () => {
            closeConfirm();
            fetch(`${API_DORMROOM}/requests/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, request_type: requestType })
            }).then(r => r.json()).then(d => {
                if (d.success) {
                    showAlert('Thành công', d.message);
                    fetchRequests();
                    refreshData();
                } else showAlert('Lỗi', d.message || d.error);
            });
        });
    };

    const currentStudentIds = useMemo(
        () => new Set(roomStudents.map(student => student.id_VNeID)),
        [roomStudents]
    );

    const classOptions = useMemo(() => (
        [...new Set(students.map(student => student.class_name).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi'))
    ), [students]);

    const selectableStudents = useMemo(() => {
        const keyword = studentSearch.trim().toLowerCase();
        return students
            .filter(student => !currentStudentIds.has(student.id_VNeID))
            .filter(student => !classFilter || student.class_name === classFilter)
            .filter(student => {
                if (!roomFilter) return true;
                if (roomFilter === '__none') return !student.current_room_id;
                return student.current_room_id === roomFilter;
            })
            .filter(student => {
                if (!keyword) return true;
                return `${student.id_VNeID} ${student.name} ${student.class_name || ''} ${student.current_room_name || ''}`.toLowerCase().includes(keyword);
            })
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    }, [students, currentStudentIds, studentSearch, classFilter, roomFilter]);

    const roomCapacity = selectedRoom?.num_of_bed ?? null;
    const currentCount = selectedRoom?.current_students ?? roomStudents.length;
    const remainingBeds = roomCapacity == null ? null : Math.max(roomCapacity - roomStudents.length, 0);
    const config = importConfigs[uploadType];

    if (loading) return <div>Đang tải danh sách phòng...</div>;

    return (
        <div style={{ padding: '20px' }}>
            <style>{`
                @media (max-width: 768px) {
                    .dorm-toolbar { flex-direction: column !important; align-items: flex-start !important; }
                    .dorm-toolbar-btns { flex-wrap: wrap !important; width: 100%; }
                    .dorm-toolbar-btns .btn { flex: 1 1 auto; min-width: 120px; }
                }
            `}</style>
            <div className="dorm-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px' }}>
                <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                    <h2 style={{ color: '#00206d', margin: 0, fontWeight: 700 }}>Quản lý phòng ở</h2>
                    <div className="btn-group">
                        <button className={`btn ${activeTab === 'rooms' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setActiveTab('rooms')}>Danh sách phòng</button>
                        <button className={`btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setActiveTab('requests')}>
                            {isManager ? 'Duyệt yêu cầu' : 'Yêu cầu của tôi'} {changeRequests.filter(r=>r.status==='PENDING').length > 0 && <span className="badge bg-danger ms-1">{changeRequests.filter(r=>r.status==='PENDING').length}</span>}
                        </button>
                    </div>
                </div>
                {activeTab === 'rooms' && (
                <div className="dorm-toolbar-btns" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-outline-primary"
                        onClick={() => navigate('/dorm-attendance')}
                        title="Điểm danh học sinh phòng KTX hàng tối"
                    >
                        <i className="fas fa-user-check me-1"></i> Điểm danh phòng
                    </button>
                    {!isTeacher && (
                        <>
                        <button className="btn btn-outline-secondary" onClick={() => window.location.href = `${API_DORMROOM}/template`} title="Tải file mẫu phòng Excel">
                            <i className="fas fa-download me-1"></i> Mẫu phòng
                        </button>
                        <button className="btn btn-outline-secondary" onClick={() => window.location.href = `${API_DORMROOM}/living-template`} title="Tải file mẫu xếp phòng Excel">
                            <i className="fas fa-download me-1"></i> Mẫu xếp phòng
                        </button>
                        <button className="btn btn-outline-success" onClick={() => window.location.href = `${API_DORMROOM}/export`} title="Xuất danh sách phòng và học sinh KTX ra Excel">
                            <i className="fas fa-file-excel me-1"></i> Xuất Excel
                        </button>
                        <button className="btn btn-success" onClick={() => openUploadModal('rooms')}>
                            <i className="fas fa-file-import me-1"></i> Nhập phòng Excel
                        </button>
                        <button className="btn btn-success" onClick={() => openUploadModal('living')}>
                            <i className="fas fa-door-open me-1"></i> Nhập xếp phòng Excel
                        </button>
                        <button
                            className="btn btn-primary"
                            style={{ background: '#00206d', borderColor: '#00206d' }}
                            onClick={openCreateRoomForm}
                        >
                            <i className="fas fa-plus me-1"></i> Thêm phòng mới
                        </button>
                        </>
                    )}
                </div>
                )}
            </div>

            {activeTab === 'requests' && (
                <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    <table className="table table-hover">
                        <thead className="table-light">
                            <tr>
                                <th>Thời gian</th>
                                <th>Giáo viên</th>
                                <th>Học sinh</th>
                                <th>Phòng</th>
                                <th>Hành động</th>
                                <th>Trạng thái</th>
                                {isManager && <th>Thao tác</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {changeRequests.map(r => (
                                <tr key={`${r.request_type || 'STUDENT_ROOM'}-${r.id}`}>
                                    <td>{r.created_at}</td>
                                    <td>{r.teacher_name}</td>
                                    <td>{r.request_type === 'ROOM_ADMIN' ? 'Thay đổi phòng' : `${r.student_name} (${r.id_student})`}</td>
                                    <td className="fw-bold">{r.room_name}</td>
                                    <td>
                                        {r.request_type === 'ROOM_ADMIN' ? (
                                            <span className={`badge ${r.action === 'EDIT_ROOM' ? 'bg-success' : 'bg-danger'}`}>
                                                {r.action === 'EDIT_ROOM' ? `Sửa phòng -> ${r.requested_name || r.room_name}` : 'Xoá phòng'}
                                            </span>
                                        ) : (
                                        <span className={`badge ${r.action==='ADD' || r.action === 'EDIT_ROOM' ? 'bg-success':'bg-danger'}`}>
                                            {r.action === 'ADD' ? 'Thêm vào phòng' : 'Xoá khỏi phòng'}
                                        </span>
                                        )}
                                    </td>
                                    <td>
                                        {r.status === 'PENDING' && <span className="badge bg-warning text-dark">Chờ duyệt</span>}
                                        {r.status === 'APPROVED' && <span className="badge bg-success">Đã duyệt</span>}
                                        {r.status === 'REJECTED' && <span className="badge bg-danger">Đã từ chối</span>}
                                    </td>
                                    {isManager && (
                                        <td>
                                            {r.status === 'PENDING' && (
                                                <>
                                                <button className="btn btn-sm btn-success me-2" onClick={()=>handleUpdateRequest(r.id, 'APPROVED', r.request_type)}>Duyệt</button>
                                                <button className="btn btn-sm btn-danger" onClick={()=>handleUpdateRequest(r.id, 'REJECTED', r.request_type)}>Từ chối</button>
                                                </>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {changeRequests.length === 0 && <tr><td colSpan="7" className="text-center py-3">Không có yêu cầu nào</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'rooms' && (
            <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div className="d-flex gap-2 flex-wrap align-items-center mb-3">
                    <select
                        className="form-select"
                        style={{ maxWidth: '220px' }}
                        value={buildingFilter}
                        onChange={(e) => setBuildingFilter(e.target.value)}
                    >
                        <option value="">Tất cả toà nhà</option>
                        {buildingOptions.map(building => (
                            <option key={building} value={building}>{building}</option>
                        ))}
                    </select>
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setBuildingFilter('')}>
                        Xoá lọc
                    </button>
                    {selectedRoomIds.length > 0 && (
                        <button className="btn btn-danger" type="button" onClick={openBulkActionModal}>
                            Thao tác hàng loạt ({selectedRoomIds.length})
                        </button>
                    )}
                </div>
                <div className="table-responsive-x">
                <table className="table table-striped table-hover mb-0" style={{ minWidth: '480px' }}>
                    <thead style={{ background: '#00206d', color: '#fff' }}>
                        <tr>
                            <th style={{ width: '42px' }}>
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={filteredDormrooms.length > 0 && filteredDormrooms.every(room => selectedRoomIds.includes(room.id))}
                                    onChange={(e) => toggleAllRooms(e.target.checked)}
                                />
                            </th>
                            <th>Tên phòng</th>
                            <th>Số giường</th>
                            <th>Đang ở</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDormrooms.map(room => {
                            const currentStudents = room.current_students || 0;
                            const isFull = room.num_of_bed != null && currentStudents >= room.num_of_bed;
                            return (
                                <tr key={room.id} onClick={() => openRoom(room)} style={{ cursor: 'pointer' }}>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={selectedRoomIds.includes(room.id)}
                                            onChange={() => toggleRoomSelection(room.id)}
                                        />
                                    </td>
                                    <td className="fw-bold">{room.name}</td>
                                    <td>{room.num_of_bed ?? '-'}</td>
                                    <td>{currentStudents}</td>
                                    <td>
                                        <span className={`badge ${isFull ? 'bg-danger' : 'bg-success'}`}>
                                            {isFull ? 'Đã đủ' : 'Còn chỗ'}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="btn btn-sm btn-info me-2" onClick={(e) => { e.stopPropagation(); openEditRoomForm(room); }}>
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room); }}>
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredDormrooms.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center">Không có dữ liệu</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>
            )}

            {showRoomForm && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-xl modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{editingRoomId ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}</h5>
                                <button type="button" className="btn-close" onClick={() => { setShowRoomForm(false); setEditingRoomId(''); setSelectedRoom(null); }}></button>
                            </div>
                            <form onSubmit={handleSaveRoom}>
                                <div className="modal-body p-4">
                                    {roomFormError && <div className="alert alert-danger">{roomFormError}</div>}
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Mã phòng *</label>
                                        <input className="form-control" value={roomForm.id} onChange={(e) => setRoomForm({ ...roomForm, id: e.target.value })} disabled={!!editingRoomId} required />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold small">Tên phòng *</label>
                                        <input className="form-control" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} required />
                                    </div>
                                    <div className="mb-0">
                                        <label className="form-label fw-bold small">Số giường</label>
                                        <input type="number" min="0" className="form-control" value={roomForm.num_of_bed} onChange={(e) => setRoomForm({ ...roomForm, num_of_bed: e.target.value })} />
                                    </div>
                                    {editingRoomId && selectedRoom && (
                                        <div className="row g-4 mt-2">
                                            <div className="col-md-5">
                                                <h6 className="fw-bold mb-3">Học sinh trong phòng</h6>
                                                <div className="border rounded" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                                    {roomLoading ? (
                                                        <div className="p-3 text-muted">Đang tải dữ liệu...</div>
                                                    ) : roomStudents.length === 0 ? (
                                                        <div className="p-3 text-muted">Chưa có học sinh trong phòng</div>
                                                    ) : (
                                                        roomStudents.map(student => (
                                                            <div key={student.id_VNeID} className="d-flex justify-content-between align-items-center p-3 border-bottom">
                                                                <div>
                                                                    <div className="fw-bold">{student.name}</div>
                                                                    <div className="small text-muted">{student.id_VNeID} {student.class_name ? `| Lớp ${student.class_name}` : ''}</div>
                                                                </div>
                                                                <button type="button" className="btn btn-sm btn-outline-danger" title="Xoá khỏi phòng" onClick={() => handleRemoveStudent(student.id_VNeID)}>
                                                                    <i className="fas fa-user-minus"></i>
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                            <div className="col-md-7">
                                                <div className="d-flex justify-content-between align-items-center mb-3">
                                                    <h6 className="fw-bold mb-0">Thêm học sinh</h6>
                                                    <button type="button" className="btn btn-sm btn-primary" disabled={selectedStudentIds.length === 0 || assigning} onClick={assignStudentsToRoom}>
                                                        {assigning ? 'Đang gửi...' : `${isTeacher ? 'Yêu cầu thêm' : 'Thêm'} ${selectedStudentIds.length} học sinh`}
                                                    </button>
                                                </div>
                                                {assignResult && <div className={`alert ${assignResult.success ? 'alert-success' : 'alert-danger'}`}>{assignResult.message}</div>}
                                                <input className="form-control mb-2" placeholder="Tìm theo mã, họ tên, lớp hoặc phòng" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                                                <div className="row g-2 mb-3">
                                                    <div className="col-md-6">
                                                        <select className="form-select" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                                                            <option value="">Tất cả lớp</option>
                                                            {classOptions.map(className => <option key={className} value={className}>Lớp {className}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="col-md-6">
                                                        <select className="form-select" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                                                            <option value="">Tất cả phòng hiện có</option>
                                                            <option value="__none">Chưa có phòng</option>
                                                            {sortedDormrooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="border rounded" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                    {selectableStudents.length === 0 ? (
                                                        <div className="p-3 text-muted">Không có học sinh phù hợp</div>
                                                    ) : selectableStudents.map(student => (
                                                        <label key={student.id_VNeID} className="d-flex align-items-start gap-3 p-3 border-bottom" style={{ cursor: 'pointer' }}>
                                                            <input type="checkbox" className="form-check-input mt-1" checked={selectedStudentIds.includes(student.id_VNeID)} onChange={() => toggleStudent(student.id_VNeID)} />
                                                            <div>
                                                                <div className="fw-bold">{student.name}</div>
                                                                <div className="small text-muted">
                                                                    {student.id_VNeID} {student.class_name ? `| Lớp ${student.class_name}` : ''} | Phòng hiện tại: {student.current_room_name || 'Chưa có'}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => { setShowRoomForm(false); setEditingRoomId(''); setSelectedRoom(null); }}>Hủy</button>
                                    <button type="submit" className="btn btn-primary" disabled={savingRoom}>{savingRoom ? 'Đang lưu...' : 'Lưu phòng'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {selectedRoom && !showRoomForm && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-xl modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header d-flex justify-content-between align-items-center">
                                <div>
                                    <h5 className="modal-title fw-bold mb-1">{selectedRoom.name}</h5>
                                    <div className="small text-muted">Mã phòng: {selectedRoom.id}</div>
                                </div>
                                <div className="d-flex align-items-center gap-3">
                                    <div>
                                        {isTeacher ? (
                                            <button className="btn btn-sm btn-outline-info" onClick={() => { setSelectedRoom(null); openEditRoomForm(selectedRoom); }}>Đổi/Xoá</button>
                                        ) : (
                                            <>
                                                <button className="btn btn-sm btn-info me-2" onClick={() => { setSelectedRoom(null); openEditRoomForm(selectedRoom); }}><i className="fas fa-edit"></i> Chỉnh sửa</button>
                                                <button className="btn btn-sm btn-danger" onClick={() => { setSelectedRoom(null); handleDeleteRoom(selectedRoom); }}><i className="fas fa-trash"></i> Xoá</button>
                                            </>
                                        )}
                                    </div>
                                    <button type="button" className="btn-close" onClick={() => setSelectedRoom(null)}></button>
                                </div>
                            </div>
                            <div className="modal-body p-4">
                                <div className="row g-3 mb-4">
                                    <div className="col-md-3"><strong>Số giường:</strong> {roomCapacity ?? '-'}</div>
                                    <div className="col-md-3"><strong>Đang ở:</strong> {roomStudents.length || currentCount}</div>
                                    <div className="col-md-3"><strong>Còn trống:</strong> {remainingBeds ?? '-'}</div>
                                    <div className="col-md-3">
                                        <strong>Trạng thái:</strong>{' '}
                                        <span className={`badge ${remainingBeds === 0 ? 'bg-danger' : 'bg-success'}`}>
                                            {remainingBeds === 0 ? 'Đã đủ' : 'Còn chỗ'}
                                        </span>
                                    </div>
                                </div>

                                <div className="row g-4">
                                    <div className="col-md-4">
                                        <h6 className="fw-bold mb-3">Học sinh trong phòng</h6>
                                        <div className="border rounded mb-4" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                            {roomLoading ? (
                                                <div className="p-3 text-muted">Đang tải dữ liệu...</div>
                                            ) : roomStudents.length === 0 ? (
                                                <div className="p-3 text-muted">Chưa có học sinh trong phòng</div>
                                            ) : (
                                                roomStudents.map(student => (
                                                    <div key={student.id_VNeID} className="d-flex justify-content-between align-items-center p-3 border-bottom">
                                                        <div>
                                                            <div className="fw-bold">{student.name}</div>
                                                            <div className="small text-muted">{student.id_VNeID} {student.class_name ? `| Lớp ${student.class_name}` : ''}</div>
                                                        </div>
                                                        <button type="button" className="btn btn-sm btn-outline-danger" title="Xoá khỏi phòng" onClick={() => handleRemoveStudent(student.id_VNeID)}>
                                                            <i className="fas fa-user-minus"></i>
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <div className="col-md-8">
                                        <h6 className="fw-bold mb-3">Lỗi phòng theo ngày/tuần/tháng</h6>
                                        <div className="d-flex gap-2 mb-2">
                                            <select className="form-select form-select-sm" value={roomViolationRange} onChange={(e) => setRoomViolationRange(e.target.value)}>
                                                <option value="day">Ngày</option>
                                                <option value="week">Tuần</option>
                                                <option value="month">Tháng</option>
                                            </select>
                                            <input type="date" lang="en-GB" className="form-control form-control-sm" value={inspDate} onChange={(e) => setInspDate(e.target.value)} />
                                        </div>
                                        <div className="border rounded" style={{ maxHeight: '430px', overflowY: 'auto' }}>
                                            {roomViolationsLoading ? (
                                                <div className="p-3 text-muted small">Đang tải lỗi phòng...</div>
                                            ) : !roomViolationsData?.violations?.length ? (
                                                <div className="p-3 text-muted small">Không có lỗi trong kỳ đang chọn</div>
                                            ) : (
                                                <>
                                                    <div className="p-2 bg-light border-bottom small">
                                                        Tổng: <strong>{roomViolationsData.total_violations}</strong> lỗi, trừ <strong className="text-danger">{roomViolationsData.total_penalty}</strong> điểm
                                                    </div>
                                                    {roomViolationsData.violations.map((item, index) => (
                                                        <div key={`${item.inspection_date}-${item.criteria_name}-${index}`} className="p-2 border-bottom">
                                                            <div className="small fw-bold">{item.criteria_name}</div>
                                                            <div className="small text-muted">{item.inspection_date} | {item.student_name || 'Cả phòng'}</div>
                                                            <div className="small text-danger">-{item.penalty_points} điểm</div>
                                                            {item.note && <div className="small text-muted">{item.note}</div>}
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setSelectedRoom(null)}>Đóng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {transferConfirm.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Xác nhận chuyển phòng</h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setTransferConfirm({ show: false, students: [] })}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <div className="alert alert-warning mb-3">
                                    Có {transferConfirm.students.length} học sinh đang ở phòng khác. Nếu tiếp tục, hệ thống sẽ chuyển các học sinh này sang phòng {selectedRoom?.name}.
                                </div>
                                <div className="border rounded" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                    {transferConfirm.students.map((student) => (
                                        <div key={student.id_VNeID} className="p-3 border-bottom">
                                            <div className="fw-bold">{student.name}</div>
                                            <div className="small text-muted">
                                                {student.id_VNeID}
                                                {student.class_name ? ` | Lớp ${student.class_name}` : ''}
                                                {student.current_room_name ? ` | Phòng hiện tại: ${student.current_room_name}` : ''}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setTransferConfirm({ show: false, students: [] })}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setTransferConfirm({ show: false, students: [] });
                                        performAssignStudentsToRoom();
                                    }}
                                >
                                    Xác nhận chuyển phòng
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showUploadModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">{config.title}</h5>
                                <button type="button" className="btn-close" onClick={() => setShowUploadModal(false)}></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <div className="small text-muted">Các cột: <strong>{config.sample}</strong></div>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => window.location.href = config.template}>
                                        <i className="fas fa-download me-1"></i> Tải file mẫu
                                    </button>
                                </div>
                                <div
                                    onDragOver={(e) => {
                                         e.preventDefault();
                                         setDragOver(true);
                                    }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={(e) => {
                                         e.preventDefault();
                                         setDragOver(false);
                                         selectCsvFile(e.dataTransfer.files[0]);
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                         border: `2px dashed ${dragOver ? '#00206d' : '#ccc'}`,
                                         borderRadius: '10px',
                                         padding: '40px 20px',
                                         cursor: 'pointer',
                                         background: '#f8f9fa',
                                         textAlign: 'center'
                                    }}
                                >
                                    <input ref={fileInputRef} type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={(e) => selectCsvFile(e.target.files[0])} />
                                    {selectedFile ? <div className="text-success fw-bold">{selectedFile.name}</div> : 'Kéo thả hoặc bấm để chọn file Excel (.xlsx) hoặc CSV'}
                                </div>
                                {uploadResult && <div className={`alert mt-3 ${uploadResult.success ? 'alert-success' : 'alert-danger'}`}>{uploadResult.message}</div>}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>Đóng</button>
                                <button className="btn btn-success" onClick={handleUpload} disabled={!selectedFile || uploading}>
                                    {uploading ? 'Đang xử lý...' : 'Tải lên'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDuplicateModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '15px' }}>
                            <div className="modal-header border-0 pb-0">
                                <h5 className="modal-title fw-bold text-warning">
                                    <i className="fas fa-exclamation-triangle me-2"></i>Cảnh báo trùng lặp phòng ở
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowDuplicateModal(false)}></button>
                            </div>
                            <div className="modal-body py-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                <div className="alert alert-info border-0 shadow-sm mb-4 small">
                                    Các phòng ở bên dưới đã tồn tại trong hệ thống. Thông tin của chúng đã được cập nhật/ghi đè theo file Excel/CSV mới tải lên.
                                </div>
                                {Object.keys(duplicateGroups).map(blk => (
                                    <div key={blk} className="mb-3">
                                        <h6 className="fw-bold p-2 bg-light rounded text-dark">Dãy phòng: {blk}</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle table-sm mb-0">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '150px' }}>Mã phòng</th>
                                                        <th>Tên phòng</th>
                                                        <th>Dãy</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {duplicateGroups[blk].map(item => (
                                                        <tr key={item.id}>
                                                            <td><code>{item.id}</code></td>
                                                            <td><strong>{item.name}</strong></td>
                                                            <td><span className="badge bg-secondary">{item.block}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="modal-footer border-0 pt-0">
                                <button type="button" className="btn btn-primary px-4" style={{ background: '#00206d' }} onClick={() => setShowDuplicateModal(false)}>
                                    Đã hiểu & Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {bulkActionModal.show && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Thao tác hàng loạt</h5>
                                <button type="button" className="btn-close" onClick={() => setBulkActionModal(prev => ({ ...prev, show: false }))}></button>
                            </div>
                            <div className="modal-body p-4">
                                <p>Bạn đã chọn <strong>{selectedRoomIds.length}</strong> phòng. Vui lòng chọn thao tác muốn thực hiện:</p>
                                <div className="form-check mb-2">
                                    <input className="form-check-input" type="radio" name="bulkAction" id="bulkActionClear" 
                                        checked={bulkActionModal.action === 'CLEAR_STUDENTS'} 
                                        onChange={() => setBulkActionModal(prev => ({ ...prev, action: 'CLEAR_STUDENTS' }))} 
                                    />
                                    <label className="form-check-label text-warning fw-bold" htmlFor="bulkActionClear">
                                        Xoá tất cả học sinh trong phòng (Phòng vẫn được giữ lại)
                                    </label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" name="bulkAction" id="bulkActionDelete" 
                                        checked={bulkActionModal.action === 'DELETE_ROOM'} 
                                        onChange={() => setBulkActionModal(prev => ({ ...prev, action: 'DELETE_ROOM' }))} 
                                    />
                                    <label className="form-check-label text-danger fw-bold" htmlFor="bulkActionDelete">
                                        Xoá phòng
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setBulkActionModal(prev => ({ ...prev, show: false }))}>Đóng</button>
                                <button className="btn btn-danger" onClick={handleBulkAction}>Thực hiện</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {managerActionRoom && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-dialog-centered modal-sm">
                        <div className="modal-content">
                            <div className="modal-header border-0 pb-0">
                                <h5 className="modal-title fw-bold text-center w-100">Thao tác phòng {managerActionRoom.name}</h5>
                                <button type="button" className="btn-close position-absolute" style={{right: '15px'}} onClick={() => setManagerActionRoom(null)}></button>
                            </div>
                            <div className="modal-body text-center p-4">
                                <button className="btn btn-outline-danger w-100 mb-3" onClick={() => executeManagerRoomAction('DELETE_ROOM')}>
                                    <i className="fas fa-trash-alt me-2"></i> Xoá phòng (Đóng cửa)
                                </button>
                                <button className="btn btn-outline-warning w-100 text-dark" onClick={() => executeManagerRoomAction('CLEAR_STUDENTS')}>
                                    <i className="fas fa-users-slash me-2"></i> Xoá toàn bộ học sinh
                                </button>
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
            <ConfirmModal
                show={alertModal.show}
                title={alertModal.title}
                message={alertModal.message}
                onCancel={closeAlert}
                type="alert"
            />
        </div>
    );
};

export default DormManager;
