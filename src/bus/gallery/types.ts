// Core
import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

export type Image = {
    public_id: string;
    imageUrl: string;
};
export type Gallery = Array<Image>

// State
export type GalleryState = {
    gallery: null | Gallery
}

// Contracts
export type BaseContact<T = any> = CaseReducer<GalleryState, PayloadAction<T>>
