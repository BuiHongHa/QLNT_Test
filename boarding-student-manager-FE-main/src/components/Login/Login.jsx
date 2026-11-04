import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import logo from '../../assets/images/logo.png';
import { FaRegUser } from 'react-icons/fa';
import { FaKey } from 'react-icons/fa6';
import { LuEye, LuEyeOff } from "react-icons/lu";
import { FaRegQuestionCircle } from "react-icons/fa";
import { apiUrl } from '../../config/api';
import { getStoredUser, saveAuthSession } from '../../config/auth';

const Login = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // First login password change state
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [changePasswordError, setChangePasswordError] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);
    const [storedToken, setStoredToken] = useState('');

    const usernameRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (getStoredUser()) {
            navigate('/dashboard');
            return;
        }
        usernameRef.current?.focus();
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const response = await fetch(apiUrl('/api/login/'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password, remember_me: rememberMe })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                saveAuthSession({
                    accessToken: data.access_token,
                    user: data.data,
                    rememberMe: data.remember_me,
                });
                setStoredToken(data.access_token);

                if (data.data && data.data.must_change_password) {
                    setMustChangePassword(true);
                } else {
                    navigate('/dashboard');
                }
            } else {
                setErrorMsg(data.message || 'Đăng nhập thất bại');
            }
        } catch (error) {
            console.error("Login error:", error);
            setErrorMsg('Lỗi kết nối đến máy chủ BE');
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        const trimmedUsername = username.trim();
        if (!trimmedUsername) {
            setErrorMsg('Vui lòng nhập tài khoản vào ô đăng nhập trước khi chọn Quên mật khẩu.');
            usernameRef.current?.focus();
            return;
        }

        try {
            const response = await fetch(apiUrl('/api/login/forgot-password'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: trimmedUsername })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setSuccessMsg(data.message || 'Đã gửi email khôi phục mật khẩu thành công!');
            } else {
                setErrorMsg(data.message || 'Yêu cầu khôi phục mật khẩu thất bại.');
            }
        } catch (error) {
            console.error("Forgot password error:", error);
            setErrorMsg('Lỗi kết nối đến máy chủ BE');
        }
    };

    const handleFirstPasswordChange = async (e) => {
        e.preventDefault();
        setChangePasswordError('');
        if (newPassword.length < 6) {
            setChangePasswordError('Mật khẩu mới phải từ 6 ký tự trở lên.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setChangePasswordError('Mật khẩu xác nhận không khớp.');
            return;
        }

        setChangingPassword(true);
        try {
            const response = await fetch(apiUrl('/api/login/change-password-first'), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                },
                body: JSON.stringify({ new_password: newPassword })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                alert('Đổi mật khẩu lần đầu thành công! Chào mừng bạn đến với hệ thống.');
                setMustChangePassword(false);
                navigate('/dashboard');
            } else {
                setChangePasswordError(data.message || 'Lỗi đổi mật khẩu.');
            }
        } catch (error) {
            console.error("First password change error:", error);
            setChangePasswordError('Lỗi kết nối đến máy chủ BE');
        } finally {
            setChangingPassword(false);
        }
    };

    return (
        <div className="wrapper-login">
            <div className="content-login">
                <div className="logo-Phenikaa-w">
                    <img src={logo} className="img-logo-w" alt="Logo UTC" />
                </div>

                <div className="content-form-login">
                    <h2 className="title-h2">Đăng nhập</h2>
                    {errorMsg && <div style={{ color: 'red', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{errorMsg}</div>}
                    {successMsg && <div style={{ color: '#28a745', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{successMsg}</div>}

                    <form onSubmit={handleLogin}>
                        <div className="form-item">
                            <label htmlFor="username" className="form-label">
                                <FaRegUser />
                            </label>
                            <input
                                ref={usernameRef}
                                name="username"
                                type="text"
                                id="username"
                                className="form-control"
                                placeholder="Nhập tài khoản hoặc email"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div className="form-item">
                            <label htmlFor="password" className="form-label">
                                <FaKey />
                            </label>
                            <input
                                name="password"
                                id="password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                placeholder="Nhập mật khẩu"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <span
                                className={showPassword ? "hide-pass" : "show-pass"}
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                            >
                                {showPassword ? <LuEyeOff /> : <LuEye />}
                            </span>
                        </div>

                        <div className="help-forgot">
                            <a className="forgot-pass" href="#" onClick={handleForgotPassword}>Quên mật khẩu</a>
                            <a href="#" className="help"><FaRegQuestionCircle /> Trợ giúp!</a>
                        </div>

                        <label className="remember-login">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            <span>Ghi nhớ đăng nhập</span>
                        </label>

                        <button type="submit" className="btn-login">
                            Đăng nhập
                        </button>
                    </form>
                </div>
            </div>

            {mustChangePassword && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        padding: '30px',
                        width: '400px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        color: '#333'
                    }}>
                        <h3 style={{ textAlign: 'center', marginBottom: '20px', color: '#223771' }}>Đổi mật khẩu lần đầu</h3>
                        <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px', textAlign: 'center' }}>
                            Đây là lần đầu bạn đăng nhập. Vui lòng thiết lập mật khẩu mới trước khi tiếp tục.
                        </p>
                        
                        {changePasswordError && <div style={{ color: 'red', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{changePasswordError}</div>}

                        <form onSubmit={handleFirstPasswordChange}>
                            <div className="form-item" style={{ marginBottom: '15px' }}>
                                <label className="form-label" style={{ color: '#666' }}><FaKey /></label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="Nhập mật khẩu mới"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    style={{ border: '1px solid #ddd', borderRadius: '4px', width: '100%', padding: '10px 10px 10px 40px' }}
                                />
                            </div>

                            <div className="form-item" style={{ marginBottom: '20px' }}>
                                <label className="form-label" style={{ color: '#666' }}><FaKey /></label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="Xác nhận mật khẩu mới"
                                    value={confirmNewPassword}
                                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    required
                                    style={{ border: '1px solid #ddd', borderRadius: '4px', width: '100%', padding: '10px 10px 10px 40px' }}
                                />
                            </div>

                            <button type="submit" className="btn-login" disabled={changingPassword} style={{ width: '100%' }}>
                                {changingPassword ? 'Đang lưu...' : 'Thay đổi mật khẩu'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
