// Constants
import { LOCAL_STORAGE } from '@/lib';

const set = (key: LOCAL_STORAGE, value: unknown) => {
    try {
        if (localStorage) {
            localStorage.setItem(key, JSON.stringify(value));
        }
    } catch (error) {}
}

const get = (key: LOCAL_STORAGE): any => {
    try {
        if (localStorage) {
            const getItem = localStorage.getItem(key);
          
            if (getItem) {
                return JSON.parse(getItem);
            }
        }
        return null;
    } catch (error) {}

};

export const ls = {
    set,
    get,
};
