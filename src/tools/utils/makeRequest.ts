// Core
import { Action } from '@reduxjs/toolkit';
import { put, call } from 'redux-saga/effects';
import { toast } from 'react-toastify';

// Redux
import { TogglesKeys } from '../../bus/client/toggles';

// Action
import { toggleCreatorAction } from '../../bus/client/toggles';

// Tools
import { customFetch } from './customFetch';

// Types
export type FetchOptions = {
    fetch: () => ReturnType<typeof fetch>;
    successStatusCode?: number;
    isNoData?: boolean;
}

type OptionsType<SuccessData, ErrorData> = {
    fetchOptions: FetchOptions;
    callAction?: Action<any>;
    toggleType?: TogglesKeys;
    // -------------------------------------------------
    skipAttemptsIfStatusCode?: number;
    skipAlertIfStatusCode?: number;
    // -------------------------------------------------
    tryStart?: Function;
    success?: (successData: SuccessData) => void;
    tryEnd?: (successData: SuccessData) => void;
    // -------------------------------------------------
    catchStart?: (errorData: ErrorData) => void;
    error?: (errorData: ErrorData) => void;
    catchEnd?: (errorData: ErrorData) => void;
    // -------------------------------------------------
    finallyStart?: Function;
    finallyEnd?: Function;
};

export function* makeRequest<SuccessData, ErrorData = {}>(options: OptionsType<SuccessData, ErrorData>) {
    const {
        skipAttemptsIfStatusCode = 0,
        skipAlertIfStatusCode = 0,
        fetchOptions,
        callAction,
        toggleType,
        tryStart, tryEnd,
        catchStart, catchEnd,
        finallyStart, finallyEnd,
        success, error,
    } = options;

    try {
        // ------------- TRY BLOCK START -------------
        if (tryStart) {
            yield tryStart();
        }

        if (toggleType) {
            yield put(toggleCreatorAction({
                type:  toggleType,
                value: true,
            }));
        }

        const result: { data: SuccessData } = yield call(() => customFetch(fetchOptions));
        if (success) {
            yield success(result.data);
        }

        if (tryEnd) {
            yield tryEnd(result.data);
        }

        return result;
        // ------------- TRY BLOCK END -------------
    } catch (errorData: ErrorData | any) {
        // ------------- CATCH BLOCK START -------------
        if (catchStart) {
            yield catchStart(errorData);
        }

        if (error) {
            yield error(errorData);
        }

        if (callAction && errorData.statusCode !== skipAttemptsIfStatusCode) {
            yield put(callAction);
        }

        if (skipAlertIfStatusCode !== errorData.statusCode && errorData.message) {
            yield toast.error(errorData.data.message);
            yield console.error(errorData.data.message);
        }

        if (catchEnd) {
            yield catchEnd(errorData);
        }

        return errorData;
        // ------------- CATCH BLOCK END -------------
    } finally {
        if (finallyStart) {
            yield finallyStart();
        }

        // ------------- FINALLY BLOCK START -------------
        if (toggleType) {
            yield put(toggleCreatorAction({
                type:  toggleType,
                value: false,
            }));
        }

        if (finallyEnd) {
            yield finallyEnd();
        }
        // ------------- FINALLY BLOCK END -------------
    }
}

