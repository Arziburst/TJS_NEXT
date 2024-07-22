// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { galleryUpdateFetcher } from '../../../api';

// Slice
import { sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as types from './types';

// Action
import { fetchGalleryAction } from './fetchGallery';

export const fetchUpdateGalleryAction = createAction<types.FetchUpdateGalleryRequest>(`${sliceName}/FETCH_UPDATE_GALLERY_ASYNC`);

// Types
import { Gallery } from '../types';

// Saga
const fetchUpdateGallery = (callAction: ReturnType<typeof fetchUpdateGalleryAction>) => makeRequest<Gallery>({
    callAction,
    toggleType:   'isLoadingUpdateGallery',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => galleryUpdateFetcher(callAction.payload),
    },
    success: function* () {
        yield put(fetchGalleryAction());
    },
});

// Watcher
export function* watchFetchUpdateGallery(): SagaIterator {
    yield takeLatest(fetchUpdateGalleryAction.type, fetchUpdateGallery);
}
