// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { getWarehousesNewPostFetcher } from '../../../api';

// Slice
import { newPostActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchWarehousesNewPostAction = createAction<types.FetchWarehousesNewPostRequest>(`${sliceName}/FETCH_WAREHOUSES_NEW_POST_ASYNC`);

// Saga
const fetchWarehousesNewPost = (
    callAction: ReturnType<typeof fetchWarehousesNewPostAction>,
) => makeRequest<types.FetchWarehousesNewPostResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchWarehousesNewPost',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => getWarehousesNewPostFetcher(callAction.payload),
    },
    success: function* (result) {
        yield put(newPostActions.setWarehousesNewPost(result));
    },
});

// Watcher
export function* watchFetchWarehousesNewPost(): SagaIterator {
    yield takeLatest(fetchWarehousesNewPostAction.type, fetchWarehousesNewPost);
}
