// Types
import { NavigateFunction } from 'react-router';
import * as commonTypes from '@/bus/commonTypes';
import * as types from '../types';

// Product
export type FetchProductRequest = types.ExtendedProduct['_id'];
export type FetchProductResponse = types.ExtendedProduct;

// Products
export type FetchProductsRequest = Array<types.ExtendedProduct['_id']>;
export type FetchProductsResponse = types.Products;

// Products by pagination
export interface FetchProductsByPaginationRequest extends Pick<types.ExtendedProduct, 'type'> {
    limit: number;
    page: number;
    isLowToHigh: null | boolean;
}
export type FetchProductsByPaginationResponse = {
    data: types.Products;
    total: number;
    totalShowed: number;
};

// Products by pagination at end
export type FetchProductsByPaginationAtEndRequest = FetchProductsByPaginationRequest
export type FetchProductsByPaginationAtEndResponse = FetchProductsByPaginationResponse

// Create product
export interface FetchCreateNewProductRequest extends types.Product, commonTypes.ResetForm {}
export type FetchCreateNewProductResponse = types.ExtendedProduct;

// Delete product
export type FetchDeleteProductRequest = {
    _id: types.ExtendedProduct['_id'];
    navigate: NavigateFunction;
};
export type FetchDeleteProductResponse = types.ExtendedProduct['_id'];

// Edit product
export interface FetchEditProductRequest extends Pick<types.ExtendedProduct, '_id'> {
    editedProduct: types.Product;
}
export type FetchEditProductResponse = types.ExtendedProduct;
