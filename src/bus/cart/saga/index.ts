// Core
import { SagaIterator } from '@redux-saga/core';
import { all, call } from 'redux-saga/effects';

// Tools
import { useDispatch } from '../../../tools/hooks';

import { fetchCheckCartAction, watchFetchCheckCart } from './fetchCheckCart';
import { fetchProductCartAction, watchFetchProductCart } from './fetchProductCart';

// Types
import * as types from './types';

export const useCartSaga = () => {
    const dispatch = useDispatch();

    return {
        fetchCheckCart:   (payload: types.FetchCheckCartRequest) => dispatch(fetchCheckCartAction(payload)),
        fetchProductCart: (payload: types.FetchProductCartRequest) => dispatch(fetchProductCartAction(payload)),
    };
};

export function* watchCart(): SagaIterator {
    yield all([
        call(watchFetchCheckCart),
        call(watchFetchProductCart),
    ]);
}
