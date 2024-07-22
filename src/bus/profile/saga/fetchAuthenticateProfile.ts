// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { authenticateProfileFetcher } from '../../../api';

// Slice
import { profileActions, sliceName } from '../slice';
import { togglesActions } from '@/bus/client/toggles';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchAuthenticateProfileAction = createAction(`${sliceName}/FETCH_AUTHENTICATE_PROFILE_ASYNC`);

// Saga
const fetchAuthenticateProfile = (
    callAction: ReturnType<typeof fetchAuthenticateProfileAction>,
) => makeRequest<types.FetchAuthenticateProfileResponse, commonTypes.Error>({
    callAction,
    fetchOptions: {
        successStatusCode: 200,
        fetch:             () => authenticateProfileFetcher(),
    },
    skipAttemptsIfStatusCode: 401,
    skipAlertIfStatusCode:    401,
    success:                  function* (result) {
        yield put(profileActions.setProfile(result));
        yield put(togglesActions.toggleCreatorAction({
            type:  'isLoggedIn',
            value: true,
        }));
    },
    error: function* () {
        yield put(togglesActions.toggleCreatorAction({
            type:  'isLoggedIn',
            value: false,
        }));
    },
});

// Watcher
export function* watchFetchAuthenticateProfile(): SagaIterator {
    yield takeLatest(fetchAuthenticateProfileAction.type, fetchAuthenticateProfile);
}
