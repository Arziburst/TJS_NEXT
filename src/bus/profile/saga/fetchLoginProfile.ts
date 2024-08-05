// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// Book
import { BOOK } from '@/lib/book';

// API
import { loginProfileFetcher } from '../../../api';

// Slice
import { profileActions, sliceName } from '../slice';
import { togglesActions } from '@/bus/client/toggles';

// Tools
import { makeRequest, removeKeysOfObject } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchLoginProfileAction = createAction<types.FetchLoginProfileRequest>(`${sliceName}/FETCH_LOGIN_PROFILE_ASYNC`);

// Saga
const fetchLoginProfile = (
    callAction: ReturnType<typeof fetchLoginProfileAction>,
) => makeRequest<types.FetchLoginProfileResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingLoginProfile',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => loginProfileFetcher(removeKeysOfObject<types.FetchLoginProfileRequest, 'redirect'>({
            keys:   [ 'redirect' ],
            object: callAction.payload,
        })),
    },
    success: function* (result) {
        yield put(profileActions.setProfile(result));
        yield put(togglesActions.toggleCreatorAction({
            type:  'isLoggedIn',
            value: true,
        }));
        toast.success('Success Login!');
        yield callAction.payload.redirect(BOOK.ROOT);
    },
});

// Watcher
export function* watchFetchLoginProfile(): SagaIterator {
    yield takeLatest(fetchLoginProfileAction.type, fetchLoginProfile);
}
