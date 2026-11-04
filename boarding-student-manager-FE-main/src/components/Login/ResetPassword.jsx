import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import { FaKey } from 'react-icons/fa6';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import { apiUrl } from '../../config/api';
import './Login.css'; // Re-use login styles

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const navigate = useNavigate();

    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!token) {
            setErrorMsg('Mã liên kết đặt lại mật khẩu không tồn tại.');
            return;
        }

        if (password.length < 6) {
            setErrorMsg('Mật khẩu phải chứa ít nhất 6 ký tự.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg('Mật khẩu xác nhận không khớp.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(apiUrl('/api/login/reset-password'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, new_password: password })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setSuccessMsg('Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...');
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            } else {
                setErrorMsg(data.message || 'Lỗi đặt lại mật khẩu');
            }
        } catch (error) {
            console.error("Reset password error:", error);
            setErrorMsg('Lỗi kết nối đến máy chủ BE');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="wrapper-login">
            <div className="content-login">
                <div className="logo-Phenikaa-w">
                    <img src={logo} className="img-logo-w" alt="Logo UTC" />
                </div>

                <div className="content-form-login">
                    <h2 className="title-h2">Đặt lại mật khẩu</h2>
                    
                    {errorMsg && <div style={{ color: 'red', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{errorMsg}</div>}
                    {successMsg && <div style={{ color: '#28a745', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{successMsg}</div>}

                    {!successMsg && (
                        <form onSubmit={handleSubmit}>
                            <div className="form-item">
                                <label htmlFor="password" className="form-label">
                                    <FaKey />
                                </label>
                                <input
                                    name="password"
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Nhập mật khẩu mới"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-item">
                                <label htmlFor="confirmPassword" className="form-label">
                                    <FaKey />
                                </label>
                                <input
                                    name="confirmPassword"
                                    id="confirmPassword"
                                    type={showPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Xác nhận mật khẩu mới"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                                <span
                                    className={showPassword ? "hide-pass" : "show-pass"}
                                    onClick={() => setShowPassword(!showPassword)}
                                    title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                >
                                    {showPassword ? <LuEyeOff /> : <LuEye />}
                                </span>
                            </div>

                            <button type="submit" className="btn-login" disabled={loading}>
                                {loading ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
