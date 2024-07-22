// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';

export const initialState = null;

export const nameSlice = 'cart';
//TODO selectors types
export const cartSlice = createSlice<types.CartState, typeof reducers, "cart", any>({
    name: nameSlice,
    initialState,
    reducers,
});

export const sliceName = cartSlice.name;
export const cartActions = cartSlice.actions;
export default cartSlice.reducer;
