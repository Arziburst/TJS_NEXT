// Core
import React, { FC, useRef } from 'react';
import { TFunction } from 'i18next';

// Init
import { CSS_VARIABLES } from '@/lib';

// Import Swiper React components
import { Swiper, SwiperSlide } from 'swiper/react';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

// import required modules
import { Navigation, Pagination } from 'swiper/modules';

// Bus
import { useProducts } from '@/bus/products';

// Components
import { Icons } from '@/view/components';

// Elements
import { Button, Image } from '@/view/elements';

// Styles
import S from './styles.module.css';

// Types
type PropTypes = {
    t: TFunction;
}

export const Slider: FC<PropTypes> = ({
    t,
}) => {
    const refPrev = useRef<null | HTMLButtonElement>(null);
    const refNext = useRef<null | HTMLButtonElement>(null);

    const refPagination = useRef<null | HTMLDivElement>(null);

    const { products: { currentProduct }} = useProducts();

    return (
        <Swiper
            roundLengths
            className = { S.root }
            modules = { [ Navigation, Pagination ] }
            navigation = {{
                prevEl: refPrev.current,
                nextEl: refNext.current,
            }}
            pagination = {{ el: refPagination.current, clickable: true }}
            slidesPerView = { 1 }>
            {currentProduct?.images.map((image, index) => (
                <SwiperSlide key = { image }>
                    <Image
                        alt = { t('altImages.numberProduct', { index }) }
                        className = 'w-full'
                        src = { image }
                        style = {{ height: `calc(60vh - var(${CSS_VARIABLES.HEADER}))` }}
                    />
                </SwiperSlide>
            ))}
            <Button
                className = { `${S.button} left-0 translate-y-[-50%]` }
                ref = { refPrev }
                variant = 'default'>
                <Icons.Arrow className = { `${S.arrow} rotate-180` } />
            </Button>
            <Button
                className = { `${S.button} right-0` }
                ref = { refNext }
                variant = 'default'>
                <Icons.Arrow className = { `${S.arrow}` } />
            </Button>
            <div
                className = 'flex justify-center py-[6px]'
                ref = { refPagination }>
            </div>
        </Swiper>
    );
};
