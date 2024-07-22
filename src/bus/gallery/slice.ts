// Core
import { createSlice } from '@reduxjs/toolkit';

// Types
import * as types from './types';

// Reducers
import * as reducers from './reducers';

const initialState: types.GalleryState = {
    gallery: null,
};
//TODO selectors types
export const gallerySlice = createSlice<types.GalleryState, typeof reducers, 'gallery', any>({
    name: 'gallery',
    initialState,
    reducers,
});

export const sliceName = gallerySlice.name;
export const galleryActions = gallerySlice.actions;
export default gallerySlice.reducer;
