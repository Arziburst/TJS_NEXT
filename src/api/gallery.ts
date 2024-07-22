// Config of API
import { API, HEADERS } from './config';

// Types
import * as types from '@/bus/gallery/saga/types';

export const galleryFetcher = () => {
    return fetch(`${API.IMAGES.ROOT}`, {
        method:      'GET',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};

export const galleryUpdateFetcher = (formData: types.FetchUpdateGalleryRequest) => {
    return fetch(`${API.IMAGES.ROOT}`, {
        method:      'POST',
        credentials: 'include',
        body:        formData,
    });
};

export const galleryDeleteItemOfFetcher = (id: types.FetchDeleteItemGalleryRequest) => {
    return fetch(`${API.IMAGES.DELETE(id)}`, {
        method:      'DELETE',
        credentials: 'include',
        headers:     {
            ...HEADERS,
        },
    });
};
