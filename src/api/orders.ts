// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '../bus/orders/saga/types';

export const getOrdersFetcher = () => {
    return fetch(API.ORDERS.ROOT, {
        method:      'GET',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const getOrderFetcher = (payload: types.FetchGetOrderRequest) => {
    return fetch(API.ORDERS.ROOT_ID(payload), {
        method:      'GET',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const createOrderFetcher = (body: Omit<types.FetchCreateOrderRequest, 'navigate'>) => {
    return fetch(API.ORDERS.ROOT, {
        method:      'POST',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(body),
    });
};

export const deleteOrderFetcher = (payload: types.FetchDeleteOrderRequest) => {
    return fetch(API.ORDERS.ROOT_ID(payload), {
        method:      'DELETE',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const updateOrderFetcher = (payload: types.FetchUpdateOrderRequest) => {
    const { _id, ...body } = payload;

    return fetch(API.ORDERS.ROOT_ID(_id), {
        method:      'PUT',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(body),
    });
};
