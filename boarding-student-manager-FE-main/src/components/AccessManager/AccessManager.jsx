import { useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import ConfirmModal from '../common/ConfirmModal';
import DateRangePicker from '../common/DateRangePicker';
import { formatDateTime } from '../../utils/dateFormatter';

const API = apiUrl('/api/access_log');
const DEFAULT_CAMERA_STORAGE_KEY = 'access_default_camera_key';
const SCANNER_FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13
];

// Web Audio API beep generator
const playBeep = (freq = 800, duration = 0.15) => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error("Audio Context beep failed", e);
    }
};

const AccessManager = () => {
    const [accessLogs, setAccessLogs] = useState([]);
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [studentCode, setStudentCode] = useState('');
    const [checkResult, setCheckResult] = useState(null);
    const [cameraMessage, setCameraMessage] = useState('');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [deviceCameras, setDeviceCameras] = useState([]);
    const [selectedCameraKey, setSelectedCameraKey] = useState('');
    const [mjpegStreamUrl, setMjpegStreamUrl] = useState('');
    const [showCameraConfig, setShowCameraConfig] = useState(false);
    const [defaultCameraKey, setDefaultCameraKey] = useState(() => localStorage.getItem(DEFAULT_CAMERA_STORAGE_KEY) || '');
    const [cameraForm, setCameraForm] = useState({ name: '', camera_type: 'DEVICE', device_id: '', stream_url: '' });
    const [editingCameraId, setEditingCameraId] = useState(null);
    const [actionSubmitting, setActionSubmitting] = useState(false);

    // Status scan: 'success' | 'error' | null (dùng cho viền flash màu)
    const [scanStatus, setScanStatus] = useState(null);

    // Filter & pagination states
    const todayStr = new Date().toISOString().slice(0, 10);
    const [dateRange, setDateRange] = useState({ start: todayStr, end: todayStr });
    const [filterClass, setFilterClass] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, per_page: 15, total: 0, total_pages: 1 });
    const [classOptions, setClassOptions] = useState([]);

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'confirm' });
    const showConfirm = (title, message, onConfirm, type = 'confirm') => setConfirmModal({ show: true, title, message, onConfirm, type });
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, show: false }));
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });
    const showAlert = (title, message) => setAlertModal({ show: true, title, message });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, show: false }));

    const inputRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const detectLockRef = useRef(false);
    const activeRef = useRef(false);
    const autoStartedRef = useRef(false);
    const captureInputRef = useRef(null);
    const user = getStoredUser() || {};
    const roleMap = { 1: 'teacher', 2: 'manager', 3: 'dorm_manager', 4: 'student', 5: 'dorm_manager', 6: 'canteen_manager' };
    const roleName = user.role_name || roleMap[user.role_id] || '';
    const isTeacher = roleName === 'teacher';
    const canCheckAccess = roleName === 'manager' || roleName === 'dorm_manager';
    const teacherQueryValue = isTeacher && user.username ? user.username : '';

    const selectedSavedCamera = useMemo(() => {
        if (!selectedCameraKey.startsWith('saved:')) return null;
        const cameraId = Number(selectedCameraKey.replace('saved:', ''));
        return cameras.find(camera => camera.id === cameraId) || null;
    }, [selectedCameraKey, cameras]);

    const cameraOptionsReady = deviceCameras.length > 0 || cameras.length > 0;
    const getFirstDeviceId = () => deviceCameras[0]?.deviceId || '';
    const formatDeviceLabel = (device, index) => {
        const label = (device?.label || '').trim();
        return label ? `Cam ${index + 1} - ${label}` : `Cam ${index + 1}`;
    };

    const getFallbackCameraKey = () => {
        if (deviceCameras[0]) return `device:${deviceCameras[0].deviceId}`;
        if (cameras[0]) return `saved:${cameras[0].id}`;
        return '';
    };

    const isValidCameraKey = (cameraKey) => {
        if (!cameraKey) return false;
        if (cameraKey.startsWith('saved:')) {
            const cameraId = Number(cameraKey.replace('saved:', ''));
            return cameras.some(camera => camera.id === cameraId);
        }
        if (cameraKey.startsWith('device:')) {
            const deviceId = cameraKey.replace('device:', '');
            return !deviceId || deviceCameras.some(device => device.deviceId === deviceId);
        }
        return false;
    };

    const resolveCameraKey = (cameraKey) => (
        isValidCameraKey(cameraKey) ? cameraKey : getFallbackCameraKey()
    );

    const fetchLogs = (page = currentPage) => {
        const params = new URLSearchParams();
        if (user.username) params.set('username', user.username);
        if (roleName) params.set('role_name', roleName);
        if (dateRange.start) params.set('date_from', dateRange.start);
        if (dateRange.end) params.set('date_to', dateRange.end);
        if (filterClass) params.set('class_name', filterClass);
        if (teacherQueryValue) params.set('teacher_id', teacherQueryValue);
        if (filterSearch.trim()) params.set('search', filterSearch.trim());
        params.set('page', page);
        params.set('per_page', 15);
        fetch(`${API}/?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setAccessLogs(data.data || []);
                    if (data.pagination) setPagination(data.pagination);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    // Fetch class options for filter
    const fetchClassOptions = () => {
        const params = new URLSearchParams();
        if (user.username) params.set('username', user.username);
        if (roleName) params.set('role_name', roleName);
        if (teacherQueryValue) params.set('teacher_id', teacherQueryValue);
        const url = params.toString() ? apiUrl(`/api/class/?${params.toString()}`) : apiUrl('/api/class/');
        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const names = (data.data || []).map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
                    setClassOptions(names);
                }
            })
            .catch(console.error);
    };

    // Re-fetch when filters change
    useEffect(() => {
        setCurrentPage(1);
        fetchLogs(1);
    }, [dateRange, filterClass, filterSearch]);

    const fetchCameras = () => {
        fetch(`${API}/cameras`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setCameras(data.data || []);
            })
            .catch(console.error);
    };

    const focusInput = () => {
        if (!canCheckAccess) return;
        window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const actionLabel = (action) => ({
        OUT: 'Ra',
        IN: 'Vào',
        SKIP: 'Bỏ qua'
    }[action] || action);

    const getCurrentUsername = () => {
        return getStoredUser()?.username || '';
    };

    const actionNeedsConfirmation = (action, result = checkResult) => {
        const suggestedAction = result?.data?.presence?.suggested_action;
        return action === 'SKIP' || action !== suggestedAction || (action === 'OUT' && result?.allowed === false);
    };

    const buildActionConfirmMessage = (action, result = checkResult) => {
        const suggestedAction = result?.data?.presence?.suggested_action;
        const studentName = result?.data?.student?.name || result?.data?.student?.id_VNeID || 'học sinh này';
        if (action === 'SKIP') {
            return `Xác nhận bỏ qua lượt quét của ${studentName}?`;
        }
        if (action === 'OUT' && result?.allowed === false) {
            return `${studentName} chưa có đơn phép hợp lệ. Vẫn xác nhận RA?`;
        }
        return `Hệ thống dự đoán ${actionLabel(suggestedAction)}, bạn đang chọn ${actionLabel(action)}. Xác nhận tiếp tục?`;
    };

    const stopCamera = async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
            } catch (err) {
                console.error("Error stopping html5QrCode:", err);
            }
            html5QrCodeRef.current = null;
        }
        setMjpegStreamUrl('');
        detectLockRef.current = false;
        activeRef.current = false;
        setIsCameraActive(false);
    };

    useEffect(() => {
        fetchLogs(1);
        if (canCheckAccess) fetchCameras();
        fetchClassOptions();
        if (canCheckAccess) loadDeviceCameras(false);
        focusInput();
        return () => {
            stopCamera();
        };
    }, []);

    useEffect(() => {
        if (cameraForm.camera_type !== 'DEVICE' || cameraForm.device_id || deviceCameras.length === 0) return;
        setCameraForm(prev => ({ ...prev, device_id: getFirstDeviceId() }));
    }, [cameraForm.camera_type, cameraForm.device_id, deviceCameras]);

    const checkStudent = (code = studentCode) => {
        if (!canCheckAccess) return Promise.resolve();
        if (!code.trim()) {
            focusInput();
            return Promise.resolve();
        }
        setStudentCode(code);
        return fetch(`${API}/barcode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim(), username: user.username, role_name: roleName }),
        })
            .then(res => res.json())
            .then(data => {
                setCheckResult(data);
                focusInput();

                if (data.success && data.allowed) {
                    playBeep(880, 0.12); // Scan accepted high beep
                    setScanStatus('success');
                } else {
                    playBeep(330, 0.25); // Scan warning low beep
                    setScanStatus('error');
                }

                window.setTimeout(() => {
                    setScanStatus(null);
                }, 2000);
            })
            .catch(() => {
                setCheckResult({ success: false, allowed: false, message: 'Lỗi kết nối server' });
                focusInput();
                playBeep(220, 0.4); // Server error alarm
                setScanStatus('error');
                window.setTimeout(() => {
                    setScanStatus(null);
                }, 2000);
            });
    };

    const recordAccessAction = async (action, confirmed = false) => {
        if (!canCheckAccess) return;
        const studentId = checkResult?.data?.student?.id_VNeID;
        if (!studentId || actionSubmitting) return;

        if (!confirmed && actionNeedsConfirmation(action)) {
            return new Promise(resolve => {
                showConfirm('Xác nhận hành động', buildActionConfirmMessage(action), () => {
                    closeConfirm();
                    recordAccessAction(action, true).then(resolve);
                }, 'confirm');
            });
        }

        setActionSubmitting(true);
        try {
            const res = await fetch(`${API}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_student: studentId,
                    action,
                    confirmed,
                    username: getCurrentUsername(),
                    role_name: roleName
                }),
            });
            const data = await res.json();
            if (data.needs_confirmation) {
                setActionSubmitting(false);
                showConfirm('Xác nhận hành động', buildActionConfirmMessage(action), () => {
                    closeConfirm();
                    recordAccessAction(action, true);
                }, 'confirm');
                return;
            }

            setCheckResult(data);
            fetchLogs(currentPage);
            focusInput();

            if (data.success) {
                playBeep(action === 'SKIP' ? 520 : 880, 0.15);
                setScanStatus(action === 'SKIP' ? null : 'success');
            } else {
                playBeep(220, 0.4);
                setScanStatus('error');
            }
            window.setTimeout(() => setScanStatus(null), 2000);
        } catch {
            setCheckResult({ success: false, allowed: false, message: 'Lỗi kết nối server' });
            playBeep(220, 0.4);
            setScanStatus('error');
            window.setTimeout(() => setScanStatus(null), 2000);
            focusInput();
        } finally {
            setActionSubmitting(false);
        }
    };

    async function loadDeviceCameras(requestPermission = true) {
        setCameraMessage('');
        let tempStream = null;
        try {
            if (requestPermission) {
                tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }

            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                const videoDevices = devices.map(d => ({ deviceId: d.id, label: d.label }));
                setDeviceCameras(videoDevices);
                setSelectedCameraKey(current => current || (videoDevices[0] ? `device:${videoDevices[0].deviceId}` : ''));
            } else {
                setCameraMessage('Không tìm thấy camera thiết bị.');
            }
        } catch (err) {
            console.error("Html5Qrcode.getCameras error:", err);
            if (requestPermission) setCameraMessage('Không lấy được danh sách camera thiết bị.');
        } finally {
            if (tempStream) tempStream.getTracks().forEach(track => track.stop());
            focusInput();
        }
    }

    const resolveDeviceIdFromSavedCamera = (camera) => {
        if (camera?.device_id && deviceCameras.some(device => device.deviceId === camera.device_id)) {
            return camera.device_id;
        }
        const cameraName = (camera?.name || '').trim().toLowerCase();
        const matchedDevice = deviceCameras.find(device => (device.label || '').trim().toLowerCase() === cameraName);
        return matchedDevice?.deviceId || deviceCameras[0]?.deviceId || '';
    };

    const ensureScanner = () => {
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode("scanner-container", {
                formatsToSupport: SCANNER_FORMATS,
                verbose: false
            });
        }
        return html5QrCodeRef.current;
    };

    const handleCaptureImage = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        try {
            if (activeRef.current) await stopCamera();
            setCameraMessage('Đang đọc mã từ ảnh vừa chụp...');
            const decodedText = await ensureScanner().scanFile(file, false);
            await checkStudent(decodedText);
            setCameraMessage('Đã đọc mã từ ảnh vừa chụp.');
        } catch (err) {
            console.error("scan captured image failed:", err);
            setCameraMessage('Không đọc được mã từ ảnh vừa chụp. Hãy chụp rõ mã vạch/QR và thử lại.');
            playBeep(220, 0.4);
            setScanStatus('error');
            window.setTimeout(() => setScanStatus(null), 2000);
            focusInput();
        }
    };

    const startDeviceCamera = async (deviceId) => {
        try {
            setMjpegStreamUrl('');

            const container = document.getElementById("scanner-container");
            if (!container) {
                setCameraMessage('Đang đợi khung hình camera vẽ...');
                window.setTimeout(() => startDeviceCamera(deviceId), 150);
                return;
            }

            ensureScanner();

            const config = {
                fps: 10, // 10 FPS is perfectly optimized to prevent CPU throttle
                qrbox: (width, height) => {
                    // Extremely large and highly forgiving scanning box area
                    const boxWidth = Math.min(width * 0.95, 600);
                    const boxHeight = Math.min(height * 0.75, 300);
                    return { width: boxWidth, height: boxHeight };
                },
                aspectRatio: 1.777778, // 16:9
                // NOTE: Do NOT set videoConstraints here — it will override the selected deviceId
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true // Active hardware decoding acceleration where supported
                }
            };

            setIsCameraActive(true);
            setCameraMessage('Đang khởi động camera...');

            const cameraConstraint = deviceId || { facingMode: "environment" };

            await html5QrCodeRef.current.start(
                cameraConstraint,
                config,
                async (decodedText) => {
                    if (detectLockRef.current) return;
                    detectLockRef.current = true;

                    await checkStudent(decodedText);

                    window.setTimeout(() => {
                        detectLockRef.current = false;
                        focusInput();
                    }, 1000); // 1.0s debounce to avoid duplicate scans
                },
                () => {
                    // Ignore scanner diagnostic errors to keep console clean
                }
            );

            activeRef.current = true;
            setCameraMessage('Camera đang chạy. Hãy di chuyển mã vạch/QR vào vùng quét.');
            focusInput();
        } catch (err) {
            console.error("html5QrCode start failed:", err);
            setCameraMessage(`Không mở được camera: ${err.message || err}`);
            setIsCameraActive(false);
            activeRef.current = false;
        }
    };

    const startSavedCamera = async (camera) => {
        if (!camera) {
            setCameraMessage('Không tìm thấy camera đã tạo.');
            focusInput();
            return;
        }
        if ((camera.camera_type || '').toUpperCase() === 'DEVICE') {
            await startDeviceCamera(resolveDeviceIdFromSavedCamera(camera));
            return;
        }
        if (!camera.stream_url) {
            setCameraMessage('Camera đã tạo chưa có URL stream.');
            focusInput();
            return;
        }
        setMjpegStreamUrl(`${API}/cameras/${camera.id}/stream?t=${Date.now()}`);
        activeRef.current = true;
        setIsCameraActive(true);
        setCameraMessage('Đang hiển thị RTSP qua proxy MJPEG của backend.');
        focusInput();
    };

    const startCamera = async (cameraKeyOverride = selectedCameraKey) => {
        setCameraMessage('');
        if (activeRef.current) await stopCamera();
        try {
            const cameraKey = cameraKeyOverride || (deviceCameras[0] ? `device:${deviceCameras[0].deviceId}` : '');
            if (cameraKey.startsWith('saved:')) {
                const cameraId = Number(cameraKey.replace('saved:', ''));
                await startSavedCamera(cameras.find(camera => camera.id === cameraId));
            } else {
                await startDeviceCamera(cameraKey.replace('device:', ''));
            }
        } catch {
            setCameraMessage('Không mở được camera đã chọn.');
            focusInput();
        }
    };

    const handleCameraChange = async (cameraKey) => {
        setSelectedCameraKey(cameraKey);
        if (activeRef.current) {
            setCameraMessage('Đang chuyển camera...');
            await stopCamera();
            window.setTimeout(() => {
                startCamera(cameraKey);
            }, 350); // 350ms safety delay for browser camera release
        } else {
            focusInput();
        }
    };

    useEffect(() => {
        if (!canCheckAccess) return;
        if (loading || autoStartedRef.current || !cameraOptionsReady) return;
        if (defaultCameraKey.startsWith('device:') && deviceCameras.length === 0) return;
        if (defaultCameraKey.startsWith('saved:') && cameras.length === 0) return;
        const cameraKey = resolveCameraKey(defaultCameraKey || selectedCameraKey);
        if (!cameraKey) return;
        autoStartedRef.current = true;
        setSelectedCameraKey(cameraKey);
        window.setTimeout(() => startCamera(cameraKey), 100); // 100ms delay to guarantee DOM has painted
    }, [canCheckAccess, loading, cameraOptionsReady, defaultCameraKey, selectedCameraKey, deviceCameras, cameras]);

    useEffect(() => {
        if (!canCheckAccess || !mjpegStreamUrl) return;

        const intervalId = setInterval(() => {
            fetch(`${API}/last_scan`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.has_scan && data.scan) {
                        const scanResult = data.scan;
                        setCheckResult(scanResult);
                        if (scanResult.student_id) {
                            setStudentCode(scanResult.student_id);
                        }

                        if (scanResult.success && scanResult.allowed) {
                            playBeep(880, 0.15);
                            setScanStatus('success');
                        } else {
                            playBeep(330, 0.35);
                            setScanStatus('error');
                        }

                        window.setTimeout(() => {
                            setScanStatus(null);
                        }, 2000);
                    }
                })
                .catch(console.error);
        }, 1200);

        return () => {
            clearInterval(intervalId);
        };
    }, [canCheckAccess, mjpegStreamUrl]);


    const saveDefaultCamera = (cameraKey = selectedCameraKey) => {
        const resolvedKey = resolveCameraKey(cameraKey);
        if (!resolvedKey) return;
        localStorage.setItem(DEFAULT_CAMERA_STORAGE_KEY, resolvedKey);
        setDefaultCameraKey(resolvedKey);
        setSelectedCameraKey(resolvedKey);
        if (activeRef.current) {
            window.setTimeout(() => startCamera(resolvedKey), 0);
        }
        focusInput();
    };

    const resetCameraForm = () => {
        setCameraForm({ name: '', camera_type: 'DEVICE', device_id: getFirstDeviceId(), stream_url: '' });
        setEditingCameraId(null);
        focusInput();
    };

    const editCamera = (camera) => {
        setEditingCameraId(camera.id);
        setCameraForm({
            name: camera.name || '',
            camera_type: (camera.camera_type || 'DEVICE').toUpperCase(),
            device_id: camera.device_id || '',
            stream_url: camera.stream_url || ''
        });
    };

    const saveCamera = (e) => {
        e.preventDefault();
        if (cameraForm.camera_type === 'DEVICE' && !cameraForm.device_id) {
            showAlert('Lỗi', 'Hãy chọn camera thiết bị cụ thể.');
            return;
        }
        const isEditing = Boolean(editingCameraId);
        fetch(isEditing ? `${API}/cameras/${editingCameraId}` : `${API}/cameras`, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cameraForm),
        })
            .then(res => res.json())
            .then(data => {
                if (!data.success) showAlert('Lỗi', data.message || data.error || 'Không lưu được camera');
                else {
                    resetCameraForm();
                    fetchCameras();
                    if (isEditing && selectedCameraKey === `saved:${editingCameraId}` && activeRef.current) {
                        window.setTimeout(() => startCamera(`saved:${editingCameraId}`), 0);
                    }
                }
                focusInput();
            });
    };

    const deleteCamera = (camera) => {
        showConfirm('Xoá camera', `Bạn có muốn xoá camera "${camera.name}" không?`, () => { closeConfirm(); performDeleteCamera(camera); }, 'danger');
    };

    const performDeleteCamera = (camera) => {
        fetch(`${API}/cameras/${camera.id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (!data.success) showAlert('Lỗi', data.message || data.error || 'Không xoá được camera');
                else {
                    if (editingCameraId === camera.id) resetCameraForm();
                    if (defaultCameraKey === `saved:${camera.id}`) {
                        localStorage.removeItem(DEFAULT_CAMERA_STORAGE_KEY);
                        setDefaultCameraKey('');
                    }
                    if (selectedCameraKey === `saved:${camera.id}`) {
                        stopCamera();
                        setSelectedCameraKey(deviceCameras[0] ? `device:${deviceCameras[0].deviceId}` : '');
                    }
                    fetchCameras();
                }
                focusInput();
            });
    };

    if (loading) return <div>Đang tải lịch sử ra vào...</div>;

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ color: '#00206d', marginBottom: '20px', fontWeight: 700 }}>Quản lý lịch sử ra vào</h2>

            {canCheckAccess ? (
                <div className="bg-white rounded p-4 shadow-sm mb-3">
                    <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3">
                        <h5 className="fw-bold mb-0">Kiểm tra học sinh ra vào</h5>
                        <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => setShowCameraConfig(true)}
                        >
                            Cấu hình camera
                        </button>
                    </div>

                    <div className="row g-4 align-items-start">
                        <div className="col-lg-7 col-12">
                            <div className="d-flex gap-2 flex-wrap align-items-center mb-3">
                                <select
                                    className="form-select"
                                    style={{ maxWidth: '360px' }}
                                    value={selectedCameraKey}
                                    onChange={(e) => handleCameraChange(e.target.value)}
                                >
                                    <optgroup label="Camera thiết bị">
                                        {deviceCameras.length === 0 && <option value="">Chưa có camera</option>}
                                        {deviceCameras.map((device, index) => (
                                            <option key={device.deviceId || index} value={`device:${device.deviceId}`}>
                                                {formatDeviceLabel(device, index)}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Camera đã tạo">
                                        {cameras.map((camera, index) => (
                                            <option key={camera.id} value={`saved:${camera.id}`}>
                                                {camera.name || `Cam ${index + 1}`}
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                                {!isCameraActive ? (
                                    <button className="btn btn-outline-secondary" onClick={() => startCamera()}>Bật camera</button>
                                ) : (
                                    <button className="btn btn-outline-danger" onClick={stopCamera}>Tắt camera</button>
                                )}
                                <button
                                    className="btn btn-outline-primary"
                                    type="button"
                                    onClick={() => captureInputRef.current?.click()}
                                >
                                    Chụp ảnh
                                </button>
                                <input
                                    ref={captureInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={handleCaptureImage}
                                />
                            </div>

                            {/* Wrapper for scanner and overlay */}
                            <div
                                className={`scanner-wrapper ${scanStatus ? `scan-flash-${scanStatus}` : ''}`}
                                style={{
                                    width: '75%',
                                    aspectRatio: '16 / 9',
                                    display: mjpegStreamUrl ? 'none' : 'block',
                                    position: 'relative',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    border: '3px solid #e5e7eb',
                                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                                }}
                            >
                                <div
                                    id="scanner-container"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: '#111827',
                                    }}
                                ></div>

                                {/* Scanning indicator HUD */}
                                {isCameraActive && !mjpegStreamUrl && (
                                    <>
                                        <div className="scanner-laser"></div>
                                        {/* <div className="scanner-target-box"></div> */}
                                        <div className="scanner-hint">Giữ khoảng cách thẻ 15-20cm để tự động quét</div>
                                    </>
                                )}
                            </div>

                            {mjpegStreamUrl && (
                                <img
                                    src={mjpegStreamUrl}
                                    alt={selectedSavedCamera?.name || 'Camera RTSP'}
                                    style={{
                                        width: '75%',
                                        aspectRatio: '16 / 9',
                                        background: '#111827',
                                        borderRadius: '8px',
                                        objectFit: 'cover',
                                        display: 'block',
                                    }}
                                />
                            )}
                            {cameraMessage && <div className="text-muted small mt-2">{cameraMessage}</div>}
                        </div>

                        <div className="col-lg-5 col-12">
                            <div className="d-flex gap-2 flex-wrap mb-3">
                                <input
                                    ref={inputRef}
                                    className="form-control"
                                    style={{ minWidth: '260px', flex: '1 1 260px' }}
                                    placeholder="Nhập/quét mã học sinh hoặc mã vạch"
                                    value={studentCode}
                                    onChange={(e) => setStudentCode(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') checkStudent(); }}
                                />
                                <button className="btn btn-primary" onClick={() => checkStudent()}>Kiểm tra</button>
                            </div>

                            <div className="border rounded p-3" style={{ minHeight: '160px' }}>
                                <div className="fw-semibold mb-2">Kết quả kiểm tra</div>
                                {checkResult ? (
                                    <div>
                                        <div className={`alert mb-3 ${checkResult.allowed ? 'alert-success' : 'alert-danger'}`}>
                                            {checkResult.data?.student && (
                                                <div className="d-flex gap-3 align-items-start mt-2">
                                                    <div style={{ flexShrink: 0 }}>
                                                        <img
                                                            src={checkResult.data.student.image_url || '/assets/img/no-avatar.png'}
                                                            alt={checkResult.data.student.name}
                                                            style={{
                                                                width: '200px',
                                                                height: 'auto',
                                                                // maxHeight: '160px',
                                                                objectFit: 'contain',
                                                                borderRadius: '6px',
                                                                border: '2px solid #fff',
                                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                                            }}
                                                            onError={(e) => { e.target.src = '/assets/img/no-avatar.png'; }}
                                                        />
                                                    </div>
                                                    <div className="small flex-grow-1">
                                                        <div>Mã học sinh: <strong>{checkResult.data.student.id_VNeID}</strong></div>
                                                        <div>Họ tên: <strong>{checkResult.data.student.name}</strong></div>
                                                        {checkResult.data?.presence && (
                                                            <>
                                                                <div>Trạng thái: <strong>{checkResult.data.presence.status_text}</strong></div>
                                                                {checkResult.success && checkResult.data?.student && checkResult.allowed && (
                                                                    <div>Dự đoán: <strong>{actionLabel(checkResult.data.presence.suggested_action)}</strong></div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="d-flex gap-2 flex-wrap">
                                            {checkResult.success && checkResult.data?.student && checkResult.allowed && (
                                                <>
                                                    <button className="btn btn-danger" type="button" disabled={actionSubmitting} onClick={() => recordAccessAction('OUT')}>
                                                        Ra
                                                    </button>
                                                    <button className="btn btn-success" type="button" disabled={actionSubmitting} onClick={() => recordAccessAction('IN')}>
                                                        Vào
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                className="btn btn-outline-secondary"
                                                type="button"
                                                onClick={() => {
                                                    setCheckResult(null);
                                                    setStudentCode('');
                                                    focusInput();
                                                }}
                                            >
                                                Bỏ qua
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-muted small">Chưa có dữ liệu kiểm tra.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="alert alert-info mb-3">
                    Giáo viên chỉ được xem lịch sử ra/vào của học sinh lớp mình.
                </div>
            )}

            {canCheckAccess && showCameraConfig && (
                <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => setShowCameraConfig(false)}>
                    <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Cấu hình camera</h5>
                                <button type="button" className="btn-close" onClick={() => setShowCameraConfig(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="row g-2 align-items-end mb-3">
                                    <div className="col-md-8">
                                        <label className="form-label">Camera mặc định</label>
                                        <select
                                            className="form-select"
                                            value={defaultCameraKey || selectedCameraKey}
                                            onChange={(e) => saveDefaultCamera(e.target.value)}
                                        >
                                            <optgroup label="Camera thiết bị">
                                                {deviceCameras.length === 0 && <option value="">Chưa có camera</option>}
                                                {deviceCameras.map((device, index) => (
                                                    <option key={device.deviceId || index} value={`device:${device.deviceId}`}>
                                                        {formatDeviceLabel(device, index)}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Camera đã tạo">
                                                {cameras.map((camera, index) => (
                                                    <option key={camera.id} value={`saved:${camera.id}`}>
                                                        {camera.name || `Cam ${index + 1}`}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                    </div>
                                    <div className="col-md-4">
                                        <button className="btn btn-outline-secondary w-100" type="button" onClick={() => loadDeviceCameras(true)}>
                                            Làm mới camera thiết bị
                                        </button>
                                    </div>
                                </div>

                                <form className="row g-2 mb-3" onSubmit={saveCamera}>
                                    <div className="col-md-3">
                                        <input
                                            className="form-control"
                                            placeholder="Tên camera"
                                            value={cameraForm.name}
                                            onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-2">
                                        <select
                                            className="form-select"
                                            value={cameraForm.camera_type}
                                            onChange={(e) => setCameraForm({
                                                ...cameraForm,
                                                camera_type: e.target.value,
                                                device_id: e.target.value === 'DEVICE' ? (cameraForm.device_id || getFirstDeviceId()) : '',
                                                stream_url: e.target.value === 'RTSP' ? cameraForm.stream_url : ''
                                            })}
                                        >
                                            <option value="DEVICE">Camera thiết bị</option>
                                            <option value="RTSP">RTSP</option>
                                        </select>
                                    </div>
                                    <div className="col-md-5">
                                        {cameraForm.camera_type === 'DEVICE' ? (
                                            <select
                                                className="form-select"
                                                value={cameraForm.device_id}
                                                onChange={(e) => setCameraForm({ ...cameraForm, device_id: e.target.value })}
                                            >
                                                <option value="">Chọn camera thiết bị</option>
                                                {deviceCameras.map((device, index) => (
                                                    <option key={device.deviceId || index} value={device.deviceId}>
                                                        {formatDeviceLabel(device, index)}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                className="form-control"
                                                placeholder="rtsp://..."
                                                value={cameraForm.stream_url}
                                                onChange={(e) => setCameraForm({ ...cameraForm, stream_url: e.target.value })}
                                            />
                                        )}
                                    </div>
                                    <div className="col-md-2 d-flex gap-2">
                                        <button className="btn btn-primary flex-fill" type="submit">
                                            {editingCameraId ? 'Lưu' : 'Thêm'}
                                        </button>
                                        {editingCameraId && (
                                            <button className="btn btn-outline-secondary" type="button" onClick={resetCameraForm}>
                                                Hủy
                                            </button>
                                        )}
                                    </div>
                                </form>

                                <div className="table-responsive-x">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead>
                                            <tr>
                                                <th>Tên camera</th>
                                                <th>Loại</th>
                                                <th>Stream</th>
                                                <th>Mặc định</th>
                                                <th style={{ width: '150px' }}>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cameras.map(camera => {
                                                const cameraKey = `saved:${camera.id}`;
                                                return (
                                                    <tr key={camera.id}>
                                                        <td>{camera.name}</td>
                                                        <td>{camera.camera_type}</td>
                                                        <td className="text-truncate" style={{ maxWidth: '360px' }}>
                                                            {camera.camera_type === 'DEVICE'
                                                                ? (() => {
                                                                    const deviceIndex = deviceCameras.findIndex(device => device.deviceId === camera.device_id);
                                                                    return deviceIndex >= 0
                                                                        ? formatDeviceLabel(deviceCameras[deviceIndex], deviceIndex)
                                                                        : (camera.device_id || '-');
                                                                })()
                                                                : (camera.stream_url || '-')}
                                                        </td>
                                                        <td>
                                                            {defaultCameraKey === cameraKey ? (
                                                                <span className="badge bg-success">Đang chọn</span>
                                                            ) : (
                                                                <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => saveDefaultCamera(cameraKey)}>
                                                                    Chọn
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <button className="btn btn-sm btn-outline-secondary me-2" type="button" onClick={() => editCamera(camera)}>
                                                                Sửa
                                                            </button>
                                                            <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => deleteCamera(camera)}>
                                                                Xoá
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {cameras.length === 0 && (
                                                <tr>
                                                    <td colSpan="5" className="text-muted small text-center">Chưa có camera</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCameraConfig(false)}>Đóng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded p-4 shadow-sm">
                {/* Filter bar */}
                <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
                    <DateRangePicker
                        startDate={dateRange.start}
                        endDate={dateRange.end}
                        onChange={(s, e) => setDateRange({ start: s, end: e })}
                        placeholder="Lọc theo khoảng ngày"
                    />
                    <select
                        className="form-select"
                        style={{ maxWidth: '180px' }}
                        value={filterClass}
                        onChange={(e) => setFilterClass(e.target.value)}
                    >
                        <option value="">Tất cả lớp</option>
                        {classOptions.map(cls => (
                            <option key={cls} value={cls}>Lớp {cls}</option>
                        ))}
                    </select>
                    <input
                        className="form-control"
                        style={{ maxWidth: '260px' }}
                        placeholder="Tìm tên hoặc mã học sinh..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                    />
                    <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => { setDateRange({ start: '', end: '' }); setFilterClass(''); setFilterSearch(''); }}
                    >
                        <i className="fas fa-redo me-1"></i>Xoá lọc
                    </button>
                </div>

                <div className="table-responsive-x">
                    <table className="table table-striped table-hover">
                        <thead style={{ background: '#00206d', color: '#fff' }}>
                            <tr>
                                <th>Mã học sinh</th>
                                <th>Tên học sinh</th>
                                <th>Lớp</th>
                                <th>Thời gian</th>
                                <th>Loại</th>
                                <th>Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" className="text-center">Đang tải dữ liệu...</td></tr>
                            ) : accessLogs.map(log => (
                                <tr key={log.id}>
                                    <td>{log.id_student}</td>
                                    <td>{log.student_name}</td>
                                    <td>{log.class_name || '-'}</td>
                                    <td>{formatDateTime(log.access_time)}</td>
                                    <td>
                                        {log.type === 'IN' ? <span className="badge bg-success">VÀO</span> :
                                            log.type === 'OUT' ? <span className="badge bg-danger">RA</span> :
                                                log.type === 'SKIP' ? <span className="badge bg-warning text-dark">BỎ QUA</span> :
                                                    <span className="badge bg-secondary">KIỂM TRA</span>}
                                    </td>
                                    <td>{log.note || '-'}</td>
                                </tr>
                            ))}
                            {!loading && accessLogs.length === 0 && <tr><td colSpan="6" className="text-center">Không có lịch sử ra vào</td></tr>}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination.total_pages > 1 && (
                    <nav className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2">
                        <small className="text-muted">
                            Hiển thị {accessLogs.length} / {pagination.total} bản ghi (Trang {pagination.page}/{pagination.total_pages})
                        </small>
                        <ul className="pagination pagination-sm mb-0">
                            <li className={`page-item ${pagination.page <= 1 ? 'disabled' : ''}`}>
                                <button className="page-link" onClick={() => { setCurrentPage(1); fetchLogs(1); }}>«</button>
                            </li>
                            <li className={`page-item ${pagination.page <= 1 ? 'disabled' : ''}`}>
                                <button className="page-link" onClick={() => { const p = pagination.page - 1; setCurrentPage(p); fetchLogs(p); }}>‹</button>
                            </li>
                            {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                                let start = Math.max(1, pagination.page - 2);
                                if (start + 4 > pagination.total_pages) start = Math.max(1, pagination.total_pages - 4);
                                const p = start + i;
                                if (p > pagination.total_pages) return null;
                                return (
                                    <li key={p} className={`page-item ${p === pagination.page ? 'active' : ''}`}>
                                        <button className="page-link" onClick={() => { setCurrentPage(p); fetchLogs(p); }}>{p}</button>
                                    </li>
                                );
                            })}
                            <li className={`page-item ${pagination.page >= pagination.total_pages ? 'disabled' : ''}`}>
                                <button className="page-link" onClick={() => { const p = pagination.page + 1; setCurrentPage(p); fetchLogs(p); }}>›</button>
                            </li>
                            <li className={`page-item ${pagination.page >= pagination.total_pages ? 'disabled' : ''}`}>
                                <button className="page-link" onClick={() => { setCurrentPage(pagination.total_pages); fetchLogs(pagination.total_pages); }}>»</button>
                            </li>
                        </ul>
                    </nav>
                )}
            </div>

            {/* Confirm Modal */}
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

export default AccessManager;
