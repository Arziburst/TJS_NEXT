// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// API
import { editProductFetcher } from '../../../api';

// Slice
import { productsActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchEditProductAction = createAction<types.FetchEditProductRequest>(`${sliceName}/FETCH_EDIT_PRODUCT_ASYNC`);

// Saga
const fetchEditProduct = (
    callAction: ReturnType<typeof fetchEditProductAction>,
) => makeRequest<types.FetchEditProductResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingEditProduct',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => editProductFetcher(callAction.payload),
    },
    success: function* (result) {
        yield put(productsActions.setEditedProduct(result));
        yield toast.success('Product edited successfully!');
    },
});

// Watcher
export function* watchFetchEditProduct(): SagaIterator {
    yield takeLatest(fetchEditProductAction.type, fetchEditProduct);
}
