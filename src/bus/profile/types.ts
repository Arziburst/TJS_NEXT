// Core
import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

// Types of Entities
export type Profile = {
    email: string;
    name: string,
    phone: string,
    role: 'customer' | 'admin',
}

// State
export type ProfileState = null | Profile

// Contracts
export type BaseContact<T = any> = CaseReducer<ProfileState, PayloadAction<T>>
