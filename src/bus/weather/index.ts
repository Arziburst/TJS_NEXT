import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { WeatherApiResponse } from './types'

export const weatherApiSlice = createApi({
    baseQuery: fetchBaseQuery({
        baseUrl: "http://api.weatherapi.com/v1/current.json",
    }),
    reducerPath: "weatherApi",
    tagTypes: ["weather"],
    endpoints: (build) => ({
        getWeather: build.query<WeatherApiResponse, string>({
            query: (q = "Kyiv") => `?key=${"cba938743e3b47a38ae140001240307"}&q=${q}`,
            providesTags: (result, error, id) => [{ type: "weather", id }],
        }),
    }),
});

export const { useGetWeatherQuery } = weatherApiSlice;
