// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// Book
import { BOOK } from '@/lib/book';

// API
import { registrationProfileFetcher } from '../../../api';

// Slice
import { profileActions, sliceName } from '../slice';
import { togglesActions } from '@/bus/client/toggles';

// Tools
import { makeRequest, removeKeysOfObject } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchRegistrationProfileAction = createAction<types.FetchRegistrationProfileRequest>(`${sliceName}/FETCH_REGISTRATION_PROFILE_ASYNC`);

// Saga
const fetchRegistrationProfile = (
    callAction: ReturnType<typeof fetchRegistrationProfileAction>,
) => makeRequest<types.FetchRegistrationProfileResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingRegistrationProfile',
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => registrationProfileFetcher(removeKeysOfObject<types.FetchRegistrationProfileRequest, 'navigate'>({
            keys:   [ 'navigate' ],
            object: callAction.payload,
        })),
    },
    skipAttemptsIfStatusCode: 400,
    success:                  function* (result) {
        yield put(profileActions.setProfile(result));
        yield put(togglesActions.toggleCreatorAction({
            type:  'isLoggedIn',
            value: true,
        }));
        toast.success('Success Registration!');
        toast.success('Success Login!');
        yield callAction.payload.navigate(BOOK.ROOT);
    },
});

// Watcher
export function* watchFetchRegistrationProfile(): SagaIterator {
    yield takeLatest(fetchRegistrationProfileAction.type, fetchRegistrationProfile);
}
