// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';

// API
import { logoutProfileFetcher } from '../../../api';

// Slice
import { profileActions, sliceName } from '../slice';
import { togglesActions } from '@/bus/client/toggles';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchLogoutProfileAction = createAction(`${sliceName}/FETCH_LOGOUT_PROFILE_ASYNC`);

// Saga
const fetchLogoutProfile = (
    callAction: ReturnType<typeof fetchLogoutProfileAction>,
) => makeRequest<types.FetchLogoutProfileResponse, commonTypes.Error>({
    callAction,
    toggleType:   'isLoadingLogoutProfile',
    fetchOptions: {
        successStatusCode: 204,
        fetch:             () => logoutProfileFetcher(),
        isNoData:          true,
    },
    success: function* () {
        yield put(togglesActions.toggleCreatorAction({
            type:  'isLoggedIn',
            value: false,
        }));
        yield put(profileActions.resetProfile());
    },
});

// Watcher
export function* watchFetchLogoutProfile(): SagaIterator {
    yield takeLatest(fetchLogoutProfileAction.type, fetchLogoutProfile);
}
