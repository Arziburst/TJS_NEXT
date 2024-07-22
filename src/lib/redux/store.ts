import type { Action, ThunkAction } from "@reduxjs/toolkit";
import { combineSlices, configureStore } from "@reduxjs/toolkit";

import { togglesSlice } from "@/bus/client/toggles";
import { productsSlice } from "@/bus/products/slice";
import { profileSlice } from "@/bus/profile/slice";

// Middleware
import { middleware, sagaMiddleware } from './middleware';
import { rootSaga } from "./rootSaga";

const rootReducer = combineSlices(productsSlice, profileSlice, togglesSlice);

export const makeStore = () => {
    return configureStore({
        devTools: process.env.NODE_ENV === 'development',
        reducer: rootReducer,
        middleware: (getDefaultMiddleware) => {
            
            return getDefaultMiddleware().concat();
        },
    });
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ThunkReturnType = void> = ThunkAction<
ThunkReturnType,
RootState,
unknown,
Action
>;

// sagaMiddleware.run(rootSaga);

