// Types
import * as types from './types';

export const setGallery: types.BaseContact<types.Gallery> = (state, action) => {
    return {
        ...state,
        gallery: action.payload,
    };
};
