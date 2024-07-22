// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// Init
import { LOCAL_STORAGE } from '@/init';

// Slice
import { sliceName } from '../slice';

// Saga Actions
import { fetchProductsAction } from '@/bus/products/saga/fetchProducts';
import { fetchCheckCartAction } from './fetchCheckCart';

// Tools
import { ls, makeRequest } from '../../../tools/utils';

// Types
import * as types from './types';

// Action
export const fetchProductCartAction = createAction<types.FetchProductCartRequest>(`${sliceName}/FETCH_PRODUCT_CART_ASYNC`);

function* returnFunction(callAction: ReturnType<typeof fetchProductCartAction>) {
    //! todo тут цикл

    console.log('function*returnFunction => callAction:', callAction);

    // yield put(fetchCheckCartAction(callAction.payload));
    // const cartLocalStore = ls.get(LOCAL_STORAGE.CART) || [];
    // yield put(fetchProductsAction(cartLocalStore));
}

// Saga
const fetchProductCart = (
    callAction: ReturnType<typeof fetchProductCartAction>,
) => returnFunction(callAction);

// Watcher
export function* watchFetchProductCart(): SagaIterator {
    yield takeLatest(fetchProductCartAction.type, fetchProductCart);
}
