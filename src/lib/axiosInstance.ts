import axios from "axios";
import { API_URL } from "./constants";

const AxiosInstance = axios.create({
    baseURL: API_URL
});

AxiosInstance.interceptors.request.use(
    (config) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

AxiosInstance.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);