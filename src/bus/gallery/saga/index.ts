// Core
import { SagaIterator } from '@redux-saga/core';
import { all, call } from 'redux-saga/effects';

// Tools
import { useDispatch } from '../../../tools/hooks';

// MarkerGen Watchers & Actions
import { fetchGalleryAction, watchFetchGallery } from './fetchGallery';
import { fetchUpdateGalleryAction, watchFetchUpdateGallery } from './fetchUpdateGallery';
import { fetchDeleteItemGalleryAction, watchFetchDeleteItemGallery } from './fetchDeleteItemGallery';

// Types
import * as types from './types';

export const useGallerySaga = () => {
    const dispatch = useDispatch();

    return {
        fetchGallery:       () => dispatch(fetchGalleryAction()),
        fetchUpdateGallery: (payload: types.FetchUpdateGalleryRequest) => dispatch(
            fetchUpdateGalleryAction(payload),
        ),
        fetchDeleteItemOfGallery: (
            id: types.FetchDeleteItemGalleryRequest,
        ) => dispatch(fetchDeleteItemGalleryAction(id)),
    // MarkerGen function
    };
};

export function* watchGallery(): SagaIterator {
    yield all([
        // MarkerGen watchers
        call(watchFetchGallery),
        call(watchFetchUpdateGallery),
        call(watchFetchDeleteItemGallery),
    ]);
}
