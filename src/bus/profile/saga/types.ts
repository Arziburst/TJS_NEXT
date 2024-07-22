// Types
import { NavigateFunction } from 'react-router-dom';
import * as types from '../types';

// Registration
export type FetchRegistrationProfileRequest = {
    name: string;
    phone: string;
    email: string;
    password: string;
    navigate: NavigateFunction;
};
export type FetchRegistrationProfileResponse = types.Profile;

// Login
export type FetchLoginProfileRequest = {
    email: string;
    password: string;
    navigate: NavigateFunction;
};
export type FetchLoginProfileResponse = types.Profile;

// Authenticate
export type FetchAuthenticateProfileResponse = types.Profile;

// Logout
export type FetchLogoutProfileResponse = number;
