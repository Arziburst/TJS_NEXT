// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '../bus/products/saga/types';

export const productsByPaginationFetcher = (payload: types.FetchProductsByPaginationRequest) => {
    return fetch(API.PRODUCTS.PRODUCTS_BY_PAGINATION(payload), {
        method:  'GET',
        headers: {
            ...HEADERS,
        },
    });
};

export const productFetcher = (_id: types.FetchProductRequest) => {
    return fetch(API.PRODUCTS.PRODUCT(_id), {
        method:  'GET',
        headers: {
            ...HEADERS,
        },
    });
};

export const productsFetcher = (ids: types.FetchProductsRequest) => {
    return fetch(API.PRODUCTS.ROOT + `?ids=${JSON.stringify(ids)}`, {
        method:  'GET',
        headers: {
            ...HEADERS,
        },
    });
};

export const createNewProductFetcher = (body: Omit<types.FetchCreateNewProductRequest, 'reset'>) => {
    return fetch(API.PRODUCTS.ROOT, {
        method:      'POST',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(body),
    });
};

export const deleteProductFetcher = (payload: Omit<types.FetchDeleteProductRequest, 'navigate'>) => {
    return fetch(API.PRODUCTS.PRODUCT(payload._id), {
        method:      'DELETE',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const editProductFetcher = (payload: types.FetchEditProductRequest) => {
    return fetch(API.PRODUCTS.PRODUCT(payload._id), {
        method:      'PUT',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
        body: JSON.stringify(payload.editedProduct),
    });
};
