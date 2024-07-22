// Core
import { UseFormReset } from 'react-hook-form/dist/types';

// Types
export type Error = {
    message: string;
    statusCode: number;
};

export type ResetForm = {
    reset: UseFormReset<any>; // todo remove any
}
