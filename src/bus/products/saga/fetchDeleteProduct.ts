// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// Book
import { BOOK } from '@/lib/book';

// API
import { deleteProductFetcher } from '../../../api';

// Slice
import { productsActions, sliceName } from '../slice';

// Tools
import { makeRequest, removeKeysOfObject } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchDeleteProductAction = createAction<types.FetchDeleteProductRequest>(`${sliceName}/FETCH_DELETE_PRODUCT_ASYNC`);

// Saga
const fetchDeleteProduct = (
    callAction: ReturnType<typeof fetchDeleteProductAction>,
) => makeRequest<types.FetchDeleteProductResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingDeleteProduct',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => deleteProductFetcher(removeKeysOfObject<types.FetchDeleteProductRequest, 'redirect'>({
            keys:   [ 'redirect' ],
            object: callAction.payload,
        })),
    },
    success: function* (result) {
        yield put(productsActions.setDeleteProduct(result));
        yield callAction.payload.redirect(BOOK.SHOP);
        yield toast.success('Product deleted successfully!');
    },
});

// Watcher
export function* watchFetchDeleteProduct(): SagaIterator {
    yield takeLatest(fetchDeleteProductAction.type, fetchDeleteProduct);
}
