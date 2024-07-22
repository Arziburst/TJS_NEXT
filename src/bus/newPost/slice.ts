// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';

export const initialState: types.NewPostState = {
    cities:     null,
    warehouses: null,
};
//TODO selectors types
export const newPostSlice = createSlice<types.NewPostState, typeof reducers, 'newPost', any>({
    name: 'newPost',
    initialState,
    reducers,
});

export const sliceName = newPostSlice.name;
export const newPostActions = newPostSlice.actions;
export default newPostSlice.reducer;
