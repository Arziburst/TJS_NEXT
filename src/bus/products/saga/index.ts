// Core
import { SagaIterator } from '@redux-saga/core';
import { all, call } from 'redux-saga/effects';

// Tools
import { useDispatch } from '../../../tools/hooks';

// MarkerGen Watchers & Actions
import { fetchProductsByPaginationAction, watchFetchProductsByPagination } from './fetchProductsByPagination';
import { fetchProductsByPaginationAtEndAction, watchFetchProductsByPaginationAtEnd } from './fetchProductsByPaginationAtEnd';
import { fetchProductAction, watchFetchProduct } from './fetchProduct';
import { fetchProductsAction, watchFetchProducts } from './fetchProducts';
import { fetchCreateNewProductAction, watchFetchCreateNewProduct } from './fetchCreateNewProduct';
import { fetchDeleteProductAction, watchFetchDeleteProduct } from './fetchDeleteProduct';
import { fetchEditProductAction, watchFetchEditProduct } from './fetchEditProduct';

// Types
import * as types from './types';
import { transformToCapitalize } from '@/tools/utils';

export const useProductsSaga = () => {
    const dispatch = useDispatch();

    return {
        fetchProductsByPagination: (
            payload: types.FetchProductsByPaginationRequest,
        ) => dispatch(fetchProductsByPaginationAction({
            ...payload,
            type: transformToCapitalize(payload.type),
        })),
        fetchProductsByPaginationAtEnd: (
            payload: types.FetchProductsByPaginationAtEndRequest,
        ) => dispatch(fetchProductsByPaginationAtEndAction({
            ...payload,
            type: transformToCapitalize(payload.type),
        })),
        fetchProduct:          (payload: types.FetchProductRequest) => dispatch(fetchProductAction(payload)),
        fetchProducts:         (payload: types.FetchProductsRequest) => dispatch(fetchProductsAction(payload)),
        fetchCreateNewProduct: (payload: types.FetchCreateNewProductRequest) => dispatch(
            fetchCreateNewProductAction(payload),
        ),
        fetchDeleteProduct: (_id: types.FetchDeleteProductRequest) => dispatch(fetchDeleteProductAction(_id)),
        fetchEditProduct:   (payload: types.FetchEditProductRequest) => dispatch(fetchEditProductAction(payload)),
        // MarkerGen function
    };
};

export function* watchProducts(): SagaIterator {
    yield all([
        // MarkerGen watchers
        call(watchFetchProductsByPagination),
        call(watchFetchProductsByPaginationAtEnd),
        call(watchFetchProduct),
        call(watchFetchProducts),
        call(watchFetchCreateNewProduct),
        call(watchFetchDeleteProduct),
        call(watchFetchEditProduct),
    ]);
}
