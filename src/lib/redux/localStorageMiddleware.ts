// Core
import { Middleware } from 'redux';
import { PayloadAction } from '@reduxjs/toolkit';

// Constants
import { LOCAL_STORAGE } from '../constants';

// Slice
import { nameSlice } from '@/bus/cart/slice';

// Reducer
import * as reducers from '@/bus/cart/reducers';
import { RootState } from './store';
import { ls } from '@/tools/utils';

// Types
type Actions = PayloadAction<any>;

const convertNameToAction = (name: string) => `${nameSlice}/${name}`;

export const localStorageMiddleware: Middleware<{}, RootState> = (store) => (next) => (action: Actions) => {
    const cart = store.getState().cart;

    switch (action.type) {
    case convertNameToAction(reducers.setProductOfCart.name):
        if (cart) {
            ls.set(LOCAL_STORAGE.CART, [ ...cart, action.payload ]);
        } else {
            ls.set(LOCAL_STORAGE.CART, [ action.payload ]);
        }
        break;

    case convertNameToAction(reducers.removeProductOfCart.name):
        cart && ls.set(LOCAL_STORAGE.CART, cart.filter((productHash: string) => productHash !== action.payload));
        break;

    case convertNameToAction(reducers.resetCart.name):
        ls.set(LOCAL_STORAGE.CART, []);
        break;

    default: void 0;
    }

    return next(action);
};
