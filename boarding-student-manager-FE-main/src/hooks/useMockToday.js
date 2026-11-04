/**
 * useMockToday.js
 *
 * Hook trả về ngày "hôm nay" theo backend (thời gian ảo nếu có, thật nếu không).
 *
 * Sử dụng:
 *   const today = useMockToday();     // 'YYYY-MM-DD' or ''
 *   const month = useMockToday('month'); // 'YYYY-MM'
 */
import { useEffect, useState } from 'react';
import { apiUrl } from '../config/api';

function localDateStr(d) {
    const year  = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day   = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * @param {'day'|'month'} format  'day' → YYYY-MM-DD, 'month' → YYYY-MM
 * @returns {string}  ngày hiệu lực (thật hoặc ảo)
 */
export function useMockToday(format = 'day') {
    const realToday = localDateStr(new Date());
    const [today, setToday] = useState(realToday);

    useEffect(() => {
        fetch(apiUrl('/api/debug/mock-time'))
            .then(r => r.json())
            .then(d => {
                const effectiveStr = (d.mock_active && d.effective_today) ? d.effective_today : realToday;
                setToday(format === 'month' ? effectiveStr.slice(0, 7) : effectiveStr);
            })
            .catch(() => setToday(format === 'month' ? realToday.slice(0, 7) : realToday));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return today;
}

/**
 * Hàm async (không dùng hook) — dùng được bên ngoài component.
 * @returns {Promise<string>}  YYYY-MM-DD
 */
export async function fetchMockToday() {
    try {
        const d = await fetch(apiUrl('/api/debug/mock-time')).then(r => r.json());
        if (d.mock_active && d.effective_today) return d.effective_today;
    } catch (_) { /* fall through */ }
    return localDateStr(new Date());
}
