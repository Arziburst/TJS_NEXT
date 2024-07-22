// Slice
import { initialState } from './slice';

// Types
import * as types from './types';

export const setProfile: types.BaseContact<types.Profile> = (state, action) => action.payload;

export const resetProfile = () => initialState;
