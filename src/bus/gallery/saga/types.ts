// Types
import * as types from '../types';

// Update
export type FetchUpdateGalleryRequest = FormData;
export type FetchUpdateGalleryResponse = types.Gallery;

// Delete
export type FetchDeleteItemGalleryRequest = string;
export type FetchDeleteItemGalleryResponse = unknown;
