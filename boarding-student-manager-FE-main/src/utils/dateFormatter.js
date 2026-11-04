export const formatDate = (dateVal) => {
    if (!dateVal) return '—';
    try {
        // If it's already in dd/mm/yyyy format, return it
        if (typeof dateVal === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateVal)) {
            return dateVal;
        }
        // Handle YYYY-MM-DD or other formats
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return dateVal;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return dateVal || '—';
    }
};

export const formatDateTime = (dateVal) => {
    if (!dateVal) return '—';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return dateVal;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
        return dateVal || '—';
    }
};
