// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '../bus/profile/saga/types';

export const registrationProfileFetcher = (body: Omit<types.FetchRegistrationProfileRequest, 'navigate'>) => {
    return fetch(API.PROFILE.REGISTRATION, {
        method:      'POST',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(body),
    });
};

export const loginProfileFetcher = ({ email, password }: Omit<types.FetchLoginProfileRequest, 'navigate'>) => {
    return fetch(API.PROFILE.LOGIN, {
        method:      'POST',
        credentials: 'include',
        headers:     {
            ...HEADERS,
            Authorization: `Basic ${email}:${password}`,
        },
    });
};

export const authenticateProfileFetcher = () => {
    return fetch(API.PROFILE.REFRESH, {
        method:      'GET',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const logoutProfileFetcher = () => {
    return fetch(API.PROFILE.LOGOUT, {
        method:      'DELETE',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};
