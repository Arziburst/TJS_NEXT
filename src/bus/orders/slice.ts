// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';
// MarkerGen import extraReducers

export const initialState: types.OrdersState = {
    orders:       null,
    currentOrder: null,
};
//TODO selectors types
export const ordersSlice = createSlice<types.OrdersState, typeof reducers, "orders", any>({
    name: 'orders',
    initialState,
    reducers,
    // MarkerGen use extraReducers
});

export const sliceName = ordersSlice.name;
export const ordersActions = ordersSlice.actions;
export default ordersSlice.reducer;
