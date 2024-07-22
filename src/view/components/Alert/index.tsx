// Core
import React, { FC } from 'react';
import { ToastContainer } from 'react-toastify';

// Styles
import './styles.css';

// Types
type PropTypes = {
    /* type props here */
}

export const Alert: FC<PropTypes> = () => {
    return (
        <ToastContainer
            autoClose = { 3000 }
            closeButton = { false }
            draggable = { false }
            position = 'top-center'
        />
    );
};
