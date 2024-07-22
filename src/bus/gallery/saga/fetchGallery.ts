// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { galleryFetcher } from '@/api';

// Slice
import { galleryActions, sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Action
export const fetchGalleryAction = createAction(`${sliceName}/FETCH_GALLERY_ASYNC`);

// Types
import { Gallery } from '../types';

// Saga
const fetchGallery = (callAction: ReturnType<typeof fetchGalleryAction>) => makeRequest<Gallery>({
    callAction,
    toggleType:   'isLoadingFetchGallery',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => galleryFetcher(),
    },
    success: function* (result) {
        yield put(galleryActions.setGallery(result));
    },
});

// Watcher
export function* watchFetchGallery(): SagaIterator {
    yield takeLatest(fetchGalleryAction.type, fetchGallery);
}
