// Core
import { SagaIterator } from '@redux-saga/core';
import { all, call } from 'redux-saga/effects';

// Tools
import { useDispatch } from '../../../tools/hooks';

// MarkerGen Watchers & Actions
import { fetchOrdersAction, watchFetchOrders } from './fetchOrders';
import { fetchOrderAction, watchFetchOrder } from './fetchOrder';
import { fetchCreateOrderAction, watchFetchCreateOrder } from './fetchCreateOrder';
import { fetchDeleteOrderAction, watchFetchDeleteOrder } from './fetchDeleteOrder';
import { fetchUpdateOrderAction, watchFetchUpdateOrder } from './fetchUpdateOrder';

// Types
import * as types from './types';

export const useOrdersSaga = () => {
    const dispatch = useDispatch();

    return {
        fetchOrders:      () => dispatch(fetchOrdersAction()),
        fetchOrder:       (payload: types.FetchGetOrderRequest) => dispatch(fetchOrderAction(payload)),
        fetchCreateOrder: (payload: types.FetchCreateOrderRequest) => dispatch(fetchCreateOrderAction(payload)),
        fetchDeleteOrder: (payload: types.FetchDeleteOrderRequest) => dispatch(fetchDeleteOrderAction(payload)),
        fetchUpdateOrder: (payload: types.FetchUpdateOrderRequest) => dispatch(fetchUpdateOrderAction(payload)),
        // MarkerGen function
    };
};

export function* watchOrders(): SagaIterator {
    yield all([
        // MarkerGen watchers
        call(watchFetchOrders),
        call(watchFetchOrder),
        call(watchFetchCreateOrder),
        call(watchFetchDeleteOrder),
        call(watchFetchUpdateOrder),
    ]);
}
