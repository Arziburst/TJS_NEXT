// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';
// MarkerGen import extraReducers

export const initialState: types.ProfileState = null;

// export const profileSlice = createSlice<types.ProfileState, typeof reducers>({
export const profileSlice = createSlice({
    name: 'profile',
    initialState,
    reducers,
});

export const sliceName = profileSlice.name;
export const profileActions = profileSlice.actions;
export default profileSlice.reducer;
