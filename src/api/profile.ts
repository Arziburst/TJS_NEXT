// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '../bus/profile/saga/types';

export const registrationProfileFetcher = ({ body }: types.FetchRegistrationProfileRequest) => {
    console.log("🚀 ~ registrationProfileFetcher ~ body:", body)
    return fetch(API.PROFILE.REGISTRATION, {
        method:      'POST',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(body),
    });
};

export const loginProfileFetcher = ({body:{ email, password }}: types.FetchLoginProfileRequest) => {
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
