// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { galleryDeleteItemOfFetcher } from '../../../api';

// Slice
import { sliceName } from '../slice';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as types from './types';

// Action
import { fetchGalleryAction } from './fetchGallery';

export const fetchDeleteItemGalleryAction = createAction<types.FetchDeleteItemGalleryRequest>(`${sliceName}/FETCH_DELETE_ITEM_GALLERY_ASYNC`);

// Types
import { Gallery } from '../types';

// Saga
const fetchDeleteItemGallery = (
    callAction: ReturnType<typeof fetchDeleteItemGalleryAction>,
) => makeRequest<Gallery>({
    callAction,
    toggleType:   'isLoadingDeleteItemGallery',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => galleryDeleteItemOfFetcher(callAction.payload),
    },
    success: function* () {
        yield put(fetchGalleryAction());
    },
});

// Watcher
export function* watchFetchDeleteItemGallery(): SagaIterator {
    yield takeLatest(fetchDeleteItemGalleryAction.type, fetchDeleteItemGallery);
}
