// Types
import * as types from './types';

import { initialState } from './slice';

export const setCitiesNewPost: types.BaseContact<types.NewPostState['cities']> = (state, action) => {
    return {
        ...state,
        cities: action.payload,
    };
};

export const setWarehousesNewPost: types.BaseContact<types.NewPostState['warehouses']> = (state, action) => {
    return {
        ...state,
        warehouses: action.payload,
    };
};

export const resetNewPost = () => initialState;
