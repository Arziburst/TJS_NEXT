import type { Action, ThunkAction } from "@reduxjs/toolkit";
import {
    combineSlices,
    configureStore
} from "@reduxjs/toolkit";

import { togglesSlice } from "@/bus/client/toggles";
import { productsSlice } from "@/bus/products/slice";
import { profileSlice } from "@/bus/profile/slice";
import { cartSlice } from "@/bus/cart/slice";
import { gallerySlice } from "@/bus/gallery/slice";
import { newPostSlice } from "@/bus/newPost/slice";
import { ordersSlice } from "@/bus/orders/slice";

// Middleware
import { middleware, sagaMiddleware } from './middleware';
import { rootSaga } from "./rootSaga";

const rootReducer = combineSlices(
    togglesSlice,
    profileSlice,
    productsSlice,
    cartSlice,
    gallerySlice,
    newPostSlice,
    ordersSlice
);

export const makeStore = () => {
    const Store = configureStore({
        devTools: process.env.NODE_ENV === 'development',
        reducer: rootReducer,
        middleware: (getDefaultMiddleware) => {
            return getDefaultMiddleware().concat(middleware);
        },
    });

    sagaMiddleware.run(rootSaga);

    return Store;
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
