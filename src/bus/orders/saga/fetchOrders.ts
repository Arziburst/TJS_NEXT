// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { getOrdersFetcher } from '@/api';

// Slice
import { ordersActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Action
export const fetchOrdersAction = createAction(`${sliceName}/FETCH_ORDERS_ASYNC`);

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Saga
const fetchOrders = (
    callAction: ReturnType<typeof fetchOrdersAction>,
) => makeRequest<types.FetchGetOrdersResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchOrders',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             getOrdersFetcher,
    },
    success: function* (result) {
        yield put(ordersActions.setOrders(result));
    },
});

// Watcher
export function* watchFetchOrders(): SagaIterator {
    yield takeLatest(fetchOrdersAction.type, fetchOrders);
}
