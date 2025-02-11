// Middlewares
import { Middleware } from '@reduxjs/toolkit';
import { createLogger } from 'redux-logger';

import createSagaMiddleware from '@redux-saga/core';

const isDev = process.env.NODE_ENV === 'development';

// Middlewares
import { localStorageMiddleware } from './localStorageMiddleware';

const sagaMiddleware = createSagaMiddleware();

const middleware: Middleware[] = [
    localStorageMiddleware,
    sagaMiddleware,
];

isDev && middleware.push(
    createLogger({
        duration:  true,
        collapsed: true,
        colors:    {
            title:     () => '#139BFE',
            prevState: () => '#1C5FAF',
            action:    () => '#149945',
            nextState: () => '#A47104',
            error:     () => '#ff0005',
        },
    }),
);

export {
    middleware,
    sagaMiddleware,
};
