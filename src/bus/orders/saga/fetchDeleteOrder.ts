// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { takeLatest } from 'redux-saga/effects';

// API
import { deleteOrderFetcher } from '@/api';

// Slice
import { sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchDeleteOrderAction = createAction<types.FetchDeleteOrderRequest>(`${sliceName}/FETCH_DELETE_ORDER_ASYNC`);

// Saga
const fetchDeleteOrder = (
    callAction: ReturnType<typeof fetchDeleteOrderAction>,
) => makeRequest<types.FetchDeleteOrderResponse, commonTypes.Error>({
    callAction,
    fetchOptions: {
        isNoData:          true,
        successStatusCode: 204,
        fetch:             () => deleteOrderFetcher(callAction.payload),
    },
});

// Watcher
export function* watchFetchDeleteOrder(): SagaIterator {
    yield takeLatest(fetchDeleteOrderAction.type, fetchDeleteOrder);
}
