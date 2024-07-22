// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '../bus/cart/saga/types';

export const checkCartFetcher = (payload: types.FetchCheckCartRequest) => {
    return fetch(API.CART.CHECK, {
        method:  'PUT',
        headers: {
            ...HEADERS,
        },
        body: JSON.stringify(payload),
    });
};
