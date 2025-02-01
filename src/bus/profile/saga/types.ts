// Types

import * as types from '../types';

// Registration
export type FetchRegistrationProfileRequest = {
    body: {
    name: string;
    phone: string;
    email: string;
    password: string;
    },
    redirect?: () => void;
};
export type FetchRegistrationProfileResponse = types.Profile;

// Login
export type FetchLoginProfileRequest = {
    body: {
        email: string;
        password: string;
    }
    redirect?: () => void;
};
export type FetchLoginProfileResponse = types.Profile;

// Authenticate
export type FetchAuthenticateProfileResponse = types.Profile;

// Logout
export type FetchLogoutProfileResponse = number;
