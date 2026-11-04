/**
 * DateRangePicker – Bộ chọn khoảng ngày kiểu Ant Design, hiển thị tiếng Việt.
 * Props:
 *   startDate  {string} – YYYY-MM-DD hoặc ''
 *   endDate    {string} – YYYY-MM-DD hoặc ''
 *   onChange   {(start: string, end: string) => void}
 *   placeholder {string} – văn bản hiển thị khi chưa chọn (mặc định: 'Chọn khoảng ngày')
 */
import { useEffect, useRef, useState } from 'react';

const VI_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                   'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const VI_DAYS   = ['CN','T2','T3','T4','T5','T6','T7'];

const pad = (n) => String(n).padStart(2, '0');

const toYMD = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function daysInMonth(year, month) { // month 0-based
    return new Date(year, month + 1, 0).getDate();
}

function startDayOfMonth(year, month) { // 0=Sun
    return new Date(year, month, 1).getDay();
}

function parseYMD(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function getWeekBounds() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return [toYMD(mon.getFullYear(), mon.getMonth(), mon.getDate()),
            toYMD(sun.getFullYear(), sun.getMonth(), sun.getDate())];
}

function getMonthBounds(offset = 0) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + offset;
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    return [toYMD(first.getFullYear(), first.getMonth(), 1),
            toYMD(last.getFullYear(),  last.getMonth(),  last.getDate())];
}

function CalendarPanel({ year, month, hoverDate, startDate, endDate, onSelect, onHover, onPrevMonth, onNextMonth, showPrev, showNext }) {
    const days = daysInMonth(year, month);
    const firstDay = startDayOfMonth(year, month); // 0=Sun
    // Shift so week starts on Monday: 0=Mon...6=Sun
    const startOffset = (firstDay === 0 ? 6 : firstDay - 1);

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);

    const inRange = (d) => {
        if (!d) return false;
        const cur = toYMD(year, month, d);
        const s = startDate || hoverDate;
        const e = endDate || hoverDate;
        if (!s || !e) return false;
        const [lo, hi] = s <= e ? [s, e] : [e, s];
        return cur > lo && cur < hi;
    };

    const isStart = (d) => d && toYMD(year, month, d) === startDate;
    const isEnd   = (d) => d && toYMD(year, month, d) === endDate;
    const isHover = (d) => d && toYMD(year, month, d) === hoverDate;

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return (
        <div style={{ width: 260, userSelect: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 700, fontSize: '0.95rem' }}>
                <button type="button" onClick={onPrevMonth} disabled={!showPrev}
                    style={{ background: 'none', border: 'none', cursor: showPrev ? 'pointer' : 'default', color: showPrev ? '#1677ff' : '#ccc', fontSize: '1rem', lineHeight: 1, padding: '2px 6px' }}>‹</button>
                <span>{VI_MONTHS[month]} {year}</span>
                <button type="button" onClick={onNextMonth} disabled={!showNext}
                    style={{ background: 'none', border: 'none', cursor: showNext ? 'pointer' : 'default', color: showNext ? '#1677ff' : '#ccc', fontSize: '1rem', lineHeight: 1, padding: '2px 6px' }}>›</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                    <tr>
                        {VI_DAYS.map(d => (
                            <th key={d} style={{ textAlign: 'center', padding: '4px 0', color: '#888', fontWeight: 600, width: '14.28%' }}>{d}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, wi) => (
                        <tr key={wi}>
                            {Array.from({ length: 7 }).map((_, di) => {
                                const d = week[di] ?? null;
                                const ymd = d ? toYMD(year, month, d) : null;
                                const start = isStart(d);
                                const end   = isEnd(d);
                                const inR   = inRange(d);
                                const hover = isHover(d);
                                const today = ymd === new Date().toISOString().slice(0,10);
                                return (
                                    <td key={di} style={{ textAlign: 'center', padding: '2px 0' }}>
                                        {d ? (
                                            <div
                                                onClick={() => onSelect(ymd)}
                                                onMouseEnter={() => onHover(ymd)}
                                                onMouseLeave={() => onHover(null)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: 30, height: 30,
                                                    borderRadius: (start || end) ? '50%' : (inR ? 0 : '50%'),
                                                    background: (start || end) ? '#1677ff' : inR ? '#e6f4ff' : hover ? '#f0f0f0' : 'transparent',
                                                    color: (start || end) ? '#fff' : 'inherit',
                                                    fontWeight: (start || end || today) ? 700 : 400,
                                                    cursor: 'pointer',
                                                    outline: today && !(start||end) ? '1.5px solid #1677ff' : 'none',
                                                    transition: 'background 0.15s',
                                                }}
                                            >{d}</div>
                                        ) : null}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function DateRangePicker({ startDate, endDate, onChange, placeholder = 'Chọn khoảng ngày', align = 'left' }) {
    const [open, setOpen] = useState(false);
    const [leftYear, setLeftYear] = useState(() => {
        const d = startDate ? parseYMD(startDate) : new Date();
        return d.getFullYear();
    });
    const [leftMonth, setLeftMonth] = useState(() => {
        const d = startDate ? parseYMD(startDate) : new Date();
        return d.getMonth();
    });
    const [selecting, setSelecting] = useState(null); // first click stored here
    const [hoverDate, setHoverDate] = useState(null);
    const ref = useRef(null);

    // Right panel is always left+1
    const rightMonth = (leftMonth + 1) % 12;
    const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;

    const goLeft  = () => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y-1); } else setLeftMonth(m => m-1); };
    const goRight = () => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear(y => y+1); } else setLeftMonth(m => m+1); };

    const handleSelect = (ymd) => {
        if (!selecting) {
            setSelecting(ymd);
            onChange(ymd, '');
        } else {
            const [s, e] = selecting <= ymd ? [selecting, ymd] : [ymd, selecting];
            onChange(s, e);
            setSelecting(null);
            setOpen(false);
        }
    };

    const applyShortcut = (s, e) => { onChange(s, e); setSelecting(null); setOpen(false); };

    // Keep calendar in sync when startDate changes externally
    useEffect(() => {
        if (startDate) {
            const d = parseYMD(startDate);
            setLeftYear(d.getFullYear());
            setLeftMonth(d.getMonth() === 11 ? 10 : d.getMonth()); // show left so right shows month+1
        }
    }, [startDate]);

    // Close on outside click
    useEffect(() => {
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const displayText = () => {
        if (!startDate && !endDate) return null;
        const fmt = (s) => {
            if (!s) return '?';
            try {
                const d = new Date(s + 'T00:00:00');
                if (isNaN(d.getTime())) return '?';
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            } catch {
                return '?';
            }
        };
        if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
        return fmt(startDate);
    };

    const display = displayText();

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', border: '1px solid #d9d9d9', borderRadius: 6,
                    background: '#fff', cursor: 'pointer', minWidth: 220,
                    fontSize: '0.88rem', color: display ? '#212529' : '#aaa',
                    boxShadow: open ? '0 0 0 2px rgba(22,119,255,0.2)' : 'none',
                    borderColor: open ? '#1677ff' : '#d9d9d9',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    userSelect: 'none',
                }}
            >
                <span style={{ color: '#888' }}>📅</span>
                <span style={{ flex: 1 }}>{display || placeholder}</span>
                {display && (
                    <span
                        onClick={(e) => { e.stopPropagation(); onChange('', ''); setSelecting(null); }}
                        style={{ color: '#ccc', fontSize: '0.8rem', cursor: 'pointer', lineHeight: 1 }}
                        title="Xóa"
                    >✕</span>
                )}
            </div>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: align === 'right' ? 'auto' : 0,
                    right: align === 'right' ? 0 : 'auto',
                    zIndex: 1100,
                    marginTop: 4,
                    background: '#fff',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                    boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Shortcuts */}
                    <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Hôm nay',   action: () => { const t = new Date().toISOString().slice(0,10); applyShortcut(t, t); } },
                            { label: 'Tuần này',  action: () => applyShortcut(...getWeekBounds()) },
                            { label: 'Tháng này', action: () => applyShortcut(...getMonthBounds(0)) },
                            { label: 'Tháng trước', action: () => applyShortcut(...getMonthBounds(-1)) },
                        ].map(({ label, action }) => (
                            <button key={label} type="button" onClick={action}
                                style={{ padding: '2px 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fafafa', cursor: 'pointer', fontSize: '0.8rem', color: '#1677ff', fontWeight: 600 }}>
                                {label}
                            </button>
                        ))}
                        {(startDate || endDate) && (
                            <button type="button" onClick={() => { onChange('', ''); setSelecting(null); }}
                                style={{ padding: '2px 10px', borderRadius: 4, border: '1px solid #ffa39e', background: '#fff1f0', cursor: 'pointer', fontSize: '0.8rem', color: '#cf1322', fontWeight: 600 }}>
                                Xóa bộ lọc
                            </button>
                        )}
                    </div>
                    {/* Dual calendar */}
                    <div style={{ display: 'flex', gap: 0 }}>
                        <div style={{ padding: '8px 12px' }}>
                            <CalendarPanel
                                year={leftYear} month={leftMonth}
                                hoverDate={selecting ? hoverDate : null}
                                startDate={startDate} endDate={endDate}
                                onSelect={handleSelect} onHover={setHoverDate}
                                onPrevMonth={goLeft} onNextMonth={goRight}
                                showPrev={true} showNext={false}
                            />
                        </div>
                        <div style={{ width: 1, background: '#f0f0f0', margin: '8px 0' }} />
                        <div style={{ padding: '8px 12px' }}>
                            <CalendarPanel
                                year={rightYear} month={rightMonth}
                                hoverDate={selecting ? hoverDate : null}
                                startDate={startDate} endDate={endDate}
                                onSelect={handleSelect} onHover={setHoverDate}
                                onPrevMonth={goLeft} onNextMonth={goRight}
                                showPrev={false} showNext={true}
                            />
                        </div>
                    </div>
                    {/* Footer hint */}
                    {selecting && (
                        <div style={{ padding: '6px 12px', borderTop: '1px solid #f0f0f0', fontSize: '0.78rem', color: '#888' }}>
                            Đã chọn ngày bắt đầu. Nhấn chọn ngày kết thúc.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
