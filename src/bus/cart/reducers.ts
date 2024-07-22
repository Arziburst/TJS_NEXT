// Types
import * as types from './types';

// Slice
import { initialState } from './slice';

export const setCart: types.BaseContact<types.Cart> = (/* state => */__, action) => {
    return action.payload;
};

export const setProductOfCart: types.BaseContact<types.ProductOfCart> = (state, action) => {
    if (Array.isArray(state)) {
        return [ ...state, action.payload ];
    }

    return [ action.payload ];
};

export const removeProductOfCart: types.BaseContact<types.ProductOfCart> = (state, action) => {
    if (Array.isArray(state) && state.length > 0) {
        return state.filter((productHash) => productHash !== action.payload);
    }

    return state;
};

export const resetCart: types.BaseContact<any> = (_, action) => {
    return (action && action.payload) || initialState;
};
