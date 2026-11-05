import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Barcode from 'react-barcode';
import { apiUrl } from '../../config/api';
import { getStoredUser } from '../../config/auth';

const StudentCard = () => {
    const [cardData, setCardData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = getStoredUser();
        if (user && user.username) {
            fetch(apiUrl(`/api/student/card/${user.username}`))
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setCardData(data.data);
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, []);

    if (loading) return <div>Đang tải thông tin thẻ...</div>;
    if (!cardData) return <div>Không tìm thấy thông tin sinh viên. Vui lòng liên hệ quản trị viên.</div>;

    return (
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ 
                width: '350px', 
                border: '1px solid #ddd', 
                borderRadius: '12px', 
                padding: '20px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                background: '#fff',
                textAlign: 'center'
            }}>
                <h3 style={{ color: '#00206d', marginBottom: '20px', fontWeight: 'bold' }}>THẺ HỌC SINH</h3>
                
                <div style={{ marginBottom: '20px' }}>
                    <img 
                        src={cardData.image_url || '/assets/img/no-avatar.png'} 
                        alt="Student" 
                        style={{ width: '120px', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #00206d' }}
                    />
                </div>
                
                <h4 style={{ margin: '10px 0', color: '#333' }}>{cardData.name}</h4>
                <p style={{ margin: '5px 0', color: '#666' }}>Lớp: <strong>{cardData.class_name || 'Chưa xếp lớp'}</strong></p>
                <p style={{ margin: '5px 0', color: '#666' }}>Mã VNeID: {cardData.id_VNeID}</p>
                
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                    <Barcode value={cardData.id_VNeID} width={2} height={50} displayValue={false} />
                </div>

                <div style={{ marginTop: '20px' }}>
                    <Link to="/violations" className="btn btn-outline-danger btn-sm w-100" style={{ borderRadius: '8px', padding: '8px 12px', fontWeight: 600 }}>
                        <i className="fas fa-exclamation-triangle me-2"></i>Xem lỗi vi phạm & kỷ luật
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default StudentCard;
