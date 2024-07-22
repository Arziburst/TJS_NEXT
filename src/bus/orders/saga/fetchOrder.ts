// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { getOrderFetcher } from '@/api';

// Slice
import { ordersActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Action
export const fetchOrderAction = createAction<types.FetchGetOrderRequest>(`${sliceName}/FETCH_ORDER_ASYNC`);

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Saga
const fetchOrder = (
    callAction: ReturnType<typeof fetchOrderAction>,
) => makeRequest<types.FetchGetOrderResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchOrder',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => getOrderFetcher(callAction.payload),
    },
    success: function* (result) {
        yield put(ordersActions.setCurrentOrder(result));
    },
});

// Watcher
export function* watchFetchOrder(): SagaIterator {
    yield takeLatest(fetchOrderAction.type, fetchOrder);
}
