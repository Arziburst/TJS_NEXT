// Core
import { SagaIterator } from '@redux-saga/core';
import { createAction } from '@reduxjs/toolkit';
import { put, takeLatest } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// API
import { loginProfileFetcher } from '../../../api';

// Slice
import { profileActions, sliceName } from '../slice';
import { togglesActions } from '@/bus/client/toggles';

// Tools
import { makeRequest } from '../../../tools/utils';

// Types
import * as commonTypes from '../../commonTypes';
import * as types from './types';

// Action
export const fetchLoginProfileAction = createAction<types.FetchLoginProfileRequest>(`${sliceName}/FETCH_LOGIN_PROFILE_ASYNC`);

// Saga
const fetchLoginProfile = (
    callAction: ReturnType<typeof fetchLoginProfileAction>,
) => {
    return makeRequest<types.FetchLoginProfileResponse, commonTypes.Error>({
        callAction,
        toggleType:   'isLoadingLoginProfile',
        fetchOptions: {
            successStatusCode: 200,
            fetch:             () => loginProfileFetcher(callAction.payload),
        },
        success: function* (result) {
            yield put(profileActions.setProfile(result));
            yield put(togglesActions.toggleCreatorAction({
                type:  'isLoggedIn',
                value: true,
            }));
            toast.success('Success Login!');
        },
    })
};

// Watcher
export function* watchFetchLoginProfile(): SagaIterator {
    yield takeLatest(fetchLoginProfileAction.type, fetchLoginProfile);
}
