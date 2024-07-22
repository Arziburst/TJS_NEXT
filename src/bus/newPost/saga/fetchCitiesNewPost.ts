// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { getCitiesNewPostFetcher } from '../../../api';

// Slice
import { newPostActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchCitiesNewPostAction = createAction<types.FetchCitiesNewPostRequest>(`${sliceName}/FETCH_CITIES_NEW_POST_ASYNC`);

// Saga
const fetchCitiesNewPost = (
    callAction: ReturnType<typeof fetchCitiesNewPostAction>,
) => makeRequest<types.FetchCitiesNewPostResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingFetchCitiesNewPost',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => getCitiesNewPostFetcher(callAction.payload),
    },
    success: function* (result) {
        yield put(newPostActions.setCitiesNewPost(result.slice(0, 100))); //! getCitiesNewPostFetcher >>> Limit doesn't work
    },
});

// Watcher
export function* watchFetchCitiesNewPost(): SagaIterator {
    yield takeLatest(fetchCitiesNewPostAction.type, fetchCitiesNewPost);
}
