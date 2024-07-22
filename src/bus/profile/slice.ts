// Core
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';

export const initialState: types.ProfileState = null;
//TODO selectors types
export const profileSlice = createSlice<types.ProfileState, typeof reducers, "profile", any>({
    name: "profile",
    initialState,
    reducers,
});

export const sliceName = profileSlice.name;
export const profileActions = profileSlice.actions;
export default profileSlice.reducer;
