// Types
import * as types from './types';

// Initial State
import { initialState } from './slice';

export const setOrders: types.BaseContact<types.Orders> = (state, action) => {
    return {
        ...state,
        orders: action.payload,
    };
};

export const setCurrentOrder: types.BaseContact<types.Order | null> = (state, action) => {
    return {
        ...state,
        currentOrder: action.payload,
    };
};

export const reset = () => initialState;
