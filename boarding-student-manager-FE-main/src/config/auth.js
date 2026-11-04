import { apiUrl } from './api';

const ACCESS_TOKEN_KEY = 'access_token';
const USER_KEY = 'user';

const stores = [sessionStorage, localStorage];

export const getStoredUser = () => {
    for (const store of stores) {
        const raw = store.getItem(USER_KEY);
        if (!raw) continue;
        try {
            return JSON.parse(raw);
        } catch {
            store.removeItem(USER_KEY);
        }
    }
    return null;
};

export const getStoredUserRaw = () => {
    for (const store of stores) {
        const raw = store.getItem(USER_KEY);
        if (raw) return raw;
    }
    return null;
};

export const saveAuthSession = ({ accessToken, user, rememberMe }) => {
    clearAuthSession(false);
    const targetStore = rememberMe ? localStorage : sessionStorage;
    if (accessToken) targetStore.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (user) targetStore.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuthSession = (clearCookie = true) => {
    stores.forEach((store) => {
        store.removeItem(ACCESS_TOKEN_KEY);
        store.removeItem(USER_KEY);
    });

    if (clearCookie) {
        fetch(apiUrl('/api/login/logout'), {
            method: 'POST',
            credentials: 'include',
        }).catch(() => {});
    }
};

export const refreshAuthSession = async () => {
    const response = await fetch(apiUrl('/api/login/refresh'), {
        method: 'POST',
        credentials: 'include',
    });

    if (!response.ok) {
        clearAuthSession(false);
        return null;
    }

    const data = await response.json();
    if (!data.success) {
        clearAuthSession(false);
        return null;
    }

    saveAuthSession({
        accessToken: data.access_token,
        user: data.data,
        rememberMe: data.remember_me,
    });
    return data.data;
};
