// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { productsFetcher } from '../../../api';

// Slice
import { productsActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchProductsAction = createAction<types.FetchProductsRequest>(`${sliceName}/FETCH_PRODUCTS_ASYNC`);

// Saga
const fetchProducts = (
    callAction: ReturnType<typeof fetchProductsAction>,
) => makeRequest<types.FetchProductsResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchProducts',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => productsFetcher(callAction.payload),
    },
    success: function* (result) {
        yield put(productsActions.setProducts(result));
    },
});

// Watcher
export function* watchFetchProducts(): SagaIterator {
    yield takeLatest(fetchProductsAction.type, fetchProducts);
}
