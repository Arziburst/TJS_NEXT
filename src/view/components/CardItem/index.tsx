// Core
import React, { FC } from 'react';
import { TFunction } from 'i18next';

// Init
import { STATUS_OF_PRODUCT } from '@/lib';

// Tools
import { cn } from '@/tools/lib/utils';
import { returnStylesStatus } from '@/tools/utils';

// Components
import { Icons } from '../Icons';

// Elements
import { Badge, Button, Image, ImagePropTypes, Link, LinkPropTypes } from '@/view/elements';

// Styles
import S from './styles.module.css';

// Types
import { Profile } from '@/bus/profile/types';
import { ExtendedProduct } from '@/bus/products/types';

interface ImageOfCardItemPropTypes extends Pick<ImagePropTypes, 'src' | 'alt'> {
}

interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
    Pick<LinkPropTypes, 'href'>
{
    t: TFunction;
    _id: ExtendedProduct['_id'];
    firstImage: ImageOfCardItemPropTypes;
    price: number;
    variant?: 'cart big' | 'cart small';
    available?: boolean;
    secondImage?: ImageOfCardItemPropTypes;
    title?: string;
    onClickEditItem?: () => void;
    onClickRemoveProduct?: (_id: ExtendedProduct['_id']) => void;
    role?: Profile['role'];
}

export const CardItem: FC<PropTypes> = ({
    className,
    t,
    _id,
    firstImage,
    price,
    variant,
    available,
    secondImage,
    title,
    onClickEditItem,
    onClickRemoveProduct,
    href,
    role,
    ...props
}) => {
    return (
        <div className = 'relative'>
            {role === 'admin' && (
                <Button
                    className = 'absolute top-0 right-0 z-[1] w-auto p-3'
                    variant = 'outline'
                    onClick = { onClickEditItem }>
                    <Icons.EditItem />
                </Button>
            )}

            <div
                className = { cn(
                    `${S.root} flex flex-col gap-1
                        sb:gap-3`,
                    {
                        'max-sm:gap-3 max-sm:flex-row max-sm:w-full': variant,
                        'sb:flex-row sb:w-full':                      variant === 'cart small',
                    },
                    className,
                ) }
                { ...props }>

                <Link
                    href = { href }
                    variant = 'none'>
                    <div className = { cn(`${S.images_container} relative overflow-hidden`, {
                        [ S.images_container__small ]: variant === 'cart small',
                    }) }>
                        {typeof available === 'boolean' && !available && (
                            <Badge className = { cn('absolute bottom-[10px] right-[10px] z-[1]', returnStylesStatus(STATUS_OF_PRODUCT.IN_PROGRESS)) }>
                                {t('cards.product.onlyOrder')}
                            </Badge>
                        )}

                        <Image
                            fill
                            alt = { firstImage.alt }
                            className = { cn('w-full h-full', {
                                [ `${S.first_image}` ]: !!secondImage,
                            }) }
                            src = { firstImage.src }
                        />
                        {secondImage && (
                            <Image
                                fill
                                alt = { secondImage.alt }
                                className = { `${S.second_image} w-full h-full` }
                                src = { secondImage.src || firstImage.src }
                            />
                        )}
                    </div>
                </Link>

                <div className = { cn({
                    'flex justify-between items-end w-full': onClickRemoveProduct,
                }) }>

                    <div className = 'flex flex-col gap-1 w-full'>
                        {title && (
                            <Link
                                href = { href }
                                variant = 'none'>
                                <p
                                    className = { S.title }>
                                    {title}
                                </p>
                            </Link>
                        )}
                        <div className = { cn({
                            'flex flex-wrap justify-between': variant,
                        }) }>
                            <span className = { S.price }>
                                {`${price} ₴`}
                            </span>
                            {onClickRemoveProduct && (
                                <Button
                                    className = 'w-auto text-xs text-quaternary underline hover:no-underline'
                                    variant = 'default'
                                    onClick = { () => onClickRemoveProduct && onClickRemoveProduct(_id) }>
                                    {t('buttons.remove')}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
