// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';
// MarkerGen import extraReducers

export const initialState = null;

export const nameSlice = 'cart';

export const cartSlice = createSlice<types.CartState, typeof reducers>({
    name: nameSlice,
    initialState,
    reducers,
    // MarkerGen use extraReducers
});

export const sliceName = cartSlice.name;
export const cartActions = cartSlice.actions;
export default cartSlice.reducer;
