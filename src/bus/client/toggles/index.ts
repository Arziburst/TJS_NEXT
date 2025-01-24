// Core
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useDispatch } from 'react-redux';

// Tools
import { useSelector } from '../../../tools/hooks';

// Types
export type InitialStateToggles = {
    isOnline: boolean,
    isLoggedIn: boolean,
    isOpenSideBar: boolean,
    isFilterByLowToHigh: null | boolean,

    // Loadings
    // New Post
    isLoadingFetchWarehousesNewPost: boolean;
    isLoadingFetchCitiesNewPost: boolean;

    // Profile
    isLoadingRegistrationProfile: boolean;
    isLoadingLoginProfile: boolean;
    isLoadingLogoutProfile: boolean;

    // Products
    isLoadingFetchProduct: boolean;
    isLoadingFetchProducts: boolean;
    isLoadingCreteProduct: boolean;
    isLoadingEditProduct: boolean;
    isLoadingDeleteProduct: boolean;
    isLoadingFetchProductsByPagination: boolean;

    isLoadingFetchProductsByPaginationAtEnd: boolean;


    // Orders
    isLoadingFetchCreateOrder: boolean;
    isLoadingFetchOrder: boolean;
    isLoadingFetchOrders: boolean;

    // Gallery
    isLoadingFetchGallery: boolean,
    isLoadingUpdateGallery: boolean,
    isLoadingDeleteItemGallery: boolean,
}

const initialState: InitialStateToggles = {
    isOnline:            /* navigator.onLine */ true, // TODO
    isLoggedIn:          false, // isAuthenticated
    isOpenSideBar:       false,
    isFilterByLowToHigh: null,

    // Loadings
    // New Post
    isLoadingFetchWarehousesNewPost: false,
    isLoadingFetchCitiesNewPost:     false,

    // Profile
    isLoadingRegistrationProfile: false,
    isLoadingLoginProfile:        false,
    isLoadingLogoutProfile:       false,

    // Products
    isLoadingFetchProduct:              false,
    isLoadingFetchProducts:             false,
    isLoadingCreteProduct:              false,
    isLoadingEditProduct:               false,
    isLoadingDeleteProduct:             false,
    isLoadingFetchProductsByPagination: false,

    isLoadingFetchProductsByPaginationAtEnd: false,

    // Orders
    isLoadingFetchCreateOrder: false,
    isLoadingFetchOrder:       false,
    isLoadingFetchOrders:      false,

    // Gallery
    isLoadingFetchGallery:      false,
    isLoadingUpdateGallery:     false,
    isLoadingDeleteItemGallery: false,
};

// Types
export type TogglesKeys = keyof typeof initialState;
type Options = { type: TogglesKeys, value: boolean | null };

// Slice
export const togglesSlice = createSlice({
    name:     'toggles',
    initialState,
    reducers: {
        toggleCreatorAction: (state, action: PayloadAction<Options>) => ({
            ...state,
            [ action.payload.type ]: action.payload.value,
        }),
        resetTogglesToInitialAction: () => initialState,
    },
});

// Interfaces
export const togglesActions = togglesSlice.actions;
export default togglesSlice.reducer;

export const useTogglesRedux = () => {
    const dispatch = useDispatch();
    
    return {
        togglesRedux: useSelector(({ toggles }) => toggles),
        setToggleAction: (options: Options) =>
            void dispatch(togglesActions.toggleCreatorAction(options)),
        resetTogglesToInitial: () =>
            void dispatch(togglesActions.resetTogglesToInitialAction()),
    };
};

// Used ./src/tools/helpers/makeRequest
export const toggleCreatorAction = togglesActions.toggleCreatorAction;

