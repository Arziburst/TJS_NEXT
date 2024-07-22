// Core
import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

export type CityNewPost = {
    Area: string;
    AreaDescription: string;
    AreaDescriptionRu: string;
    CityID: string;
    Delivery1: string;
    Delivery2: string;
    Delivery3: string;
    Delivery4: string;
    Delivery5: string;
    Delivery6: string;
    Delivery7: string;
    Description: string;
    DescriptionRu: string;
    IsBranch: string;
    PreventEntryNewStreetsUser: string;
    Ref: string;
    SettlementType: string;
    SettlementTypeDescription: string;
    SettlementTypeDescriptionRu: string;
    SpecialCashCheck: number
}

export type WarehouseNewPost = {
    SiteKey: string;
    Description: string;
    DescriptionRu: string;
    Number: string;
};

// State
export type CitiesNewPostNewPost = Array<CityNewPost>;
type WarehousesNewPost = Array<WarehouseNewPost>;

export type NewPostState = {
    cities: CitiesNewPostNewPost | null;
    warehouses: WarehousesNewPost | null;
}

// Contracts
export type BaseContact<T = any> = CaseReducer<NewPostState, PayloadAction<T>>
