/* eslint-disable react/display-name */
// Core
import React, { Ref, forwardRef } from 'react';
import { TFunction } from 'i18next';

// Elements
import { Image } from '@/view/elements';

// Styles
import S from './styles.module.css';

// Types
type PropTypes = {
    src: string;
    index: number;
    ref?: Ref<HTMLImageElement> | undefined;
    t: TFunction;
}

export const ImageProduct = forwardRef<HTMLImageElement, PropTypes>(({
    index,
    src,
    t,
    ...props },
ref) => {
    return (
        <Image
            { ...props }
            alt = { t('altImages.numberProduct', { index }) }
            className = { `${S.img} aspect-square w-full rounded-[8px]` }
            ref = { ref }
            src = { src }
        />
    );
});

