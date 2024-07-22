// Types
import { NavigateFunction } from 'react-router';
import * as types from '../types';

// Get Orders
export type FetchGetOrdersResponse = types.Orders;

// Get Order
export type FetchGetOrderRequest = string;
export type FetchGetOrderResponse = types.Order;

// Create Order
export interface FetchCreateOrderRequest extends Required<Pick<types.Order, 'firstName' | 'lastName' | 'phone' | 'email' | 'city' | 'warehouse'>>, Pick<types.Order, 'comment'> {
    orderedPIDs: Array<string>;
    navigate: NavigateFunction;
}
export type FetchCreateOrderResponse = types.Order;

// Delete Order
export type FetchDeleteOrderRequest = string;
export type FetchDeleteOrderResponse = unknown;

// Update Order
export interface FetchUpdateOrderRequest extends Pick<types.Order, '_id'>, Partial<Omit<types.Order, '_id'>> {}
export type FetchUpdateOrderResponse = unknown;
