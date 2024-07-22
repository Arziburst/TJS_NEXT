// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';
// MarkerGen import extraReducers

export const initialState: types.NewPostState = {
    cities:     null,
    warehouses: null,
};

export const newPostSlice = createSlice<types.NewPostState, typeof reducers>({
    name: 'newPost',
    initialState,
    reducers,
    // MarkerGen use extraReducers
});

export const sliceName = newPostSlice.name;
export const newPostActions = newPostSlice.actions;
export default newPostSlice.reducer;
