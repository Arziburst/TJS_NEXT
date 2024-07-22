// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { createOrderFetcher } from '@/api';

// Book
import { BOOK } from '@/lib/book';

// Slice
import { ordersActions, sliceName } from '../slice';

// Tools
import { makeRequest, removeKeysOfObject } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchCreateOrderAction = createAction<types.FetchCreateOrderRequest>(`${sliceName}/FETCH_CREATE_ORDER_ASYNC`);

// Saga
const fetchCreateOrder = (
    callAction: ReturnType<typeof fetchCreateOrderAction>,
) => makeRequest<types.FetchCreateOrderResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchCreateOrder',
    fetchOptions: {
        successStatusCode: 201,
        fetch:             () => createOrderFetcher(removeKeysOfObject<types.FetchCreateOrderRequest, 'navigate'>({
            keys:   [ 'navigate' ],
            object: callAction.payload,
        })),
    },
    success: function* (result) {
        yield put(ordersActions.setCurrentOrder(result));
        yield callAction.payload.navigate(BOOK.PAYMENT_SUCCESS);
    },
    error: function* () {
        yield callAction.payload.navigate(BOOK.PAYMENT_FAIL);
    },
});

// Watcher
export function* watchFetchCreateOrder(): SagaIterator {
    yield takeLatest(fetchCreateOrderAction.type, fetchCreateOrder);
}
