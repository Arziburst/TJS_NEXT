"use client" // TODO to server

// Core
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Assets
import { SCREENS_NUMBER } from '@/assets';

// Tools
import { useCustomTranslation, useWindowWidth } from '@/tools/hooks';

// Book
import { BOOK } from '@/lib/book';

// Bus
import { useProducts } from '@/bus/products';
import { useCart } from '@/bus/cart';
import { useProfile } from '@/bus/profile';

// Components
import { Slider } from './(root)/Slider';
import { ImageProduct } from './(root)/ImageProduct';
import { Icons } from '@/view/components';

// Elements
import { Button, Link, TitlePage } from '@/view/elements';

// Styles
import S from './(root)/styles.module.css';

// Static
import { checkIsProductAddedToCart } from './(root)/static';

export default function Product() {
    const router = useRouter();
    const refDescriptionProduct = useRef<null | HTMLDivElement>(null);

    const { productId } = useParams<{ productId: string }>()

    const { t } = useCustomTranslation();

    const [width] = useWindowWidth();

    // Hooks of Bus
    const { products: { currentProduct }, fetchProduct, setCurrentProduct } = useProducts();
    const { cart, setProductOfCart } = useCart();
    const { profile } = useProfile();

    // States
    const [heightState, setHeightState] = useState(0);

    const [
        isProductAddedToCartState,
        setIsProductAddedToCartState,
    ] = useState(checkIsProductAddedToCart({ cart, productId }));

    // Handlers
    const onClickAddToCartHandler = () => {
        currentProduct && setProductOfCart(currentProduct._id);
    };

    const onClickEditItemHandler = () => {
        router.push(`${BOOK.MANAGEMENT}?id=${productId}`);
    };

    useEffect(() => {
        if (productId) {
            fetchProduct(productId);
        }

        return () => {
            setCurrentProduct(null);
        };
    }, []);

    useEffect(() => {
        const result = refDescriptionProduct.current?.clientHeight; // todo how to fix this? how to get height of element from the ref?
        setHeightState(result || 0);
    }, [currentProduct]);

    useEffect(() => {
        setIsProductAddedToCartState(checkIsProductAddedToCart({ cart, productId }));
    }, [cart]);

    return (
        <div
            className={'relative flex flex-row gap-6'}
            style={{ minWidth: 0 }}>
            {profile?.role === 'admin' && (
                <Button
                    style={{ border: "1px solid #FF614A", color: "#FF614A" }}
                    className='absolute top-0 right-0 z-[1] w-auto p-3 bg-white shadow-md'
                    variant='outline'
                    onClick={onClickEditItemHandler}
                >
                    <Icons.EditItem />
                </Button>
            )}
            {width > SCREENS_NUMBER.SB && (
                <div className='w-1/2 space-y-[50px]'>
                    <div ref={refDescriptionProduct}>
                        {currentProduct?.images[0] && (
                            <ImageProduct
                                index={1}
                                src={currentProduct.images[0]}
                                t={t}
                            />
                        )}
                    </div>

                    {currentProduct
                        && currentProduct.images.length > 1
                        && currentProduct.images.filter((_, indexFilter) => indexFilter !== 0).map((src, index) => (
                            <ImageProduct
                                index={index + 2}
                                key={src}
                                src={src}
                                t={t}
                            />
                        ))}
                </div>
            )}
            <div
                className={`break-all 
                sb:w-1/2` }
                style={{ minWidth: 0 }}>
                <div
                    className={`${S.sticky} flex flex-col sb:sticky sb:justify-between`}
                    style={{
                        minHeight: refDescriptionProduct.current
                            && refDescriptionProduct.current.clientHeight > 0
                            ? `${refDescriptionProduct.current.clientHeight}px`
                            : 'auto'
                    }}>
                    <Button
                        className='mb-6 h-5 w-44'
                        variant='outline'
                        onClick={() => router.back()}
                    >
                        {t('buttons.goBack')}
                    </Button>
                    <div className='space-y-[12px]'>
                        {currentProduct?.type && (
                            <TitlePage>
                                {t(
                                    `categories.${currentProduct.type}`
                                        .toLocaleLowerCase()
                                    // TODO вечный undefined из за неверного наименования переменной
                                )}
                            </TitlePage>
                        )}
                        {width < SCREENS_NUMBER.SB && (
                            <Slider t={t} />
                        )}
                    </div>
                    <div className='space-y-[32px] sb:space-y-[48px]'>
                        <div className={`flex flex-col flex-wrap space-y-[12px]
                            sb:space-y-[24px]` }>
                            <div className={`space-y-[8px]
                                sb:space-y-[18px]` }>
                                <p className={`text-xs font-secondary font-bold tracking-[20%] uppercase
                                    sb:text-sm` }>
                                    {currentProduct?.title}
                                </p>
                                <p className={`text-lg text-quaternary
                                    sb:text-2xl` }>
                                    {currentProduct?.price} ₴
                                </p>
                            </div>
                            <p className={`text-sm tracking-[10%]
                                sb:text-base` }>
                                {currentProduct?.description}
                            </p>
                            <div>
                                <Link
                                    className={`font-secondary text-xs font-semibold tracking-[10%] text-quaternary underline transition
                                        hover:no-underline` }
                                    href='/'>
                                    {t('pages.product.link')}
                                </Link>
                            </div>
                        </div>
                        <Button
                            disabled={isProductAddedToCartState}
                            onClick={onClickAddToCartHandler}>
                            {isProductAddedToCartState ? t('pages.product.buttonProductAddedToCart') : t('pages.product.buttonAddToCart')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};