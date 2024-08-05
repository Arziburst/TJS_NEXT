// Core
import React, { FC, useEffect, useLayoutEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { redirect } from 'next/navigation';

// Tools
import { isInteger } from '@/tools/utils';
import { useCustomTranslation, useDebounceCallback } from '@/tools/hooks';

// Bus
import { useProducts } from '@/bus/products';
import { useTogglesRedux } from '@/bus/client/toggles';
import { useOrders } from '@/bus/orders';
import { useNewPost } from '@/bus/newPost';
import { useCart } from '@/bus/cart';
import { useProfile } from '@/bus/profile';

// Containers
import { NotData, ScrollArea } from '@/view/containers';

// Components
import { Form } from '../Form';
import { ContainerFields } from './ContainerFields';

// Elements
import { Button, FormTitle, Input, Textarea, TitlePage } from '@/view/elements';

// Static
import { defaultValues, validationForm } from './static';

// Types
import { CityNewPost, WarehouseNewPost } from '@/bus/newPost/types';

interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {}

export const CartDetails: FC<PropTypes> = ({ ...props }) => {
    const form = useForm({
        resolver:      yupResolver(validationForm),
        defaultValues: defaultValues,
        mode:          'onChange',
    });

    const { city, warehouse } = form.getValues();

    const { t } = useCustomTranslation();

    const [ debounceCallbackCity ] = useDebounceCallback();
    const [ debounceCallbackWarehouse ] = useDebounceCallback();

    // Hooks of Bus
    const {
        togglesRedux: {
            isLoadingFetchCreateOrder,
            isLoadingFetchCitiesNewPost,
            isLoadingFetchWarehousesNewPost,
        },
    } = useTogglesRedux();

    const { 
        newPost: { cities, warehouses }, 
        fetchCitiesNewPost, 
        fetchWarehousesNewPost
    } = useNewPost();

    const { fetchCreateOrder } = useOrders();

    const { cart } = useCart();
    const { profile } = useProfile();
    const { products: { products }} = useProducts();

    // State
    const [ totalPriceState, setTotalPriceState ] = useState(0);
    const [ isFirstRenderState, setIsFirstRenderState ] = useState(true);

    const [ isAllowCityState, setIsAllowCityState ] = useState(false);
    const [ isOpenWarehouseState, setIsOpenWarehouseState ] = useState(false);
    const [ isAllowFetchWarehouseState, setIsAllowFetchWarehouseState ] = useState(true);
    const [ wasClickWarehouseState, setWasClickWarehouseState ] = useState(false);

    // Handlers
    const onSubmit = (values: any) => { // todo how to remove any ???
        if (cart && cart.length > 0) {
            console.log('onSubmit => cart:', cart);
            const gotData = form.getValues();

            fetchCreateOrder({
                orderedPIDs: cart,
                firstName:   gotData.firstName,
                lastName:    gotData.lastName,
                phone:       gotData.phone,
                email:       gotData.email,
                city:        gotData.city,
                warehouse:   gotData.warehouse,
                comment:     gotData.comment,
                redirect
            });
        }
    };

    const onClickCityHandler = (cityParam: CityNewPost) => {
        form.setValue('city', cityParam.Description, { shouldValidate: true });
        form.clearErrors('city');
        setIsAllowCityState(true);
        fetchWarehousesNewPost({
            cityName:    cityParam.Description,
            warehouseId: warehouse,
        });
    };

    const onClickWarehouseHandler = (warehouse: WarehouseNewPost) => {
        setIsOpenWarehouseState(false);
        setIsAllowFetchWarehouseState(false);
        setWasClickWarehouseState(true);
        form.setValue('warehouse', warehouse.Description, { shouldValidate: true });
        form.clearErrors('warehouse');
    };

    useEffect(() => {
        form.watch();
    }, [ form.watch, form.formState ]);

    //! CITY
    useEffect(() => {
        if (!isFirstRenderState) {
            form.setValue('warehouse', defaultValues.warehouse);

            debounceCallbackCity(() => {
                fetchCitiesNewPost(city);
            });
        }
    }, [ city ]);

    useEffect(() => {
        if (!isFirstRenderState && !isAllowCityState && cities) {
            if (cities && cities.some((cityFromSome) => {
                return cityFromSome.Description.toLocaleLowerCase() === city.toLocaleLowerCase()
                    || cityFromSome.DescriptionRu.toLocaleLowerCase() === city.toLocaleLowerCase();
            })) {
                form.clearErrors('city');
                fetchWarehousesNewPost({
                    cityName:    city,
                    warehouseId: warehouse,
                });
                form.setError('warehouse', { message: 'errors.clickNumberWarehouse' });
            } else {
                form.setError('city', { message: 'errors.clickRightCity' });
            }
        }
    }, [ cities ]);

    //! WAREHOUSE
    useEffect(() => {
        if (!isFirstRenderState) {
            isAllowCityState && setIsAllowCityState(true);

            let isAllowFetchWarehouseStateLocal = isAllowFetchWarehouseState;

            if (wasClickWarehouseState && warehouses && !warehouses.some((warehouseFromSome) => {
                return warehouseFromSome.Description.toLocaleLowerCase() === warehouse.toLocaleLowerCase()
                    || warehouseFromSome.DescriptionRu.toLocaleLowerCase() === warehouse.toLocaleLowerCase();
            })) {
                setIsAllowFetchWarehouseState(true);
                isAllowFetchWarehouseStateLocal = true;
                setWasClickWarehouseState(false);
                setTimeout(() => {
                    form.setError('warehouse', { message: 'errors.clickRightCity' });
                }, 1_000);
            }

            if (isAllowFetchWarehouseStateLocal) {
                debounceCallbackWarehouse(() => {
                    fetchWarehousesNewPost({
                        cityName:    city,
                        warehouseId: warehouse,
                    });
                });
            }

            setIsAllowFetchWarehouseState(false);
        }
    }, [ warehouse ]);

    useEffect(() => {
        if (!isFirstRenderState) {
            if (isInteger(warehouse)) {
                setIsAllowFetchWarehouseState(true);
                form.setError('warehouse', { message: 'errors.clickRightWarehouse' });
            } else if (warehouses && warehouses.some((warehouseFromSome) => {
                return warehouseFromSome.Description.toLocaleLowerCase() === warehouse.toLocaleLowerCase()
                || warehouseFromSome.DescriptionRu.toLocaleLowerCase() === warehouse.toLocaleLowerCase();
            })) {
                form.clearErrors('warehouse');
            } else {
                setIsAllowFetchWarehouseState(true);
                form.setError('warehouse', { message: 'errors.clickNumberWarehouse' });
            }
        }
    }, [ warehouses ]);

    //! CART
    useEffect(() => {
        if (products) {
            setTotalPriceState(products.reduce(
                (acc, product) => acc + product.price,
                0,
            ));
        }
    }, [ products, cart ]);

    useEffect(() => {
        if (profile) {
            form.setValue('email', profile.email, { shouldValidate: true });
            form.setValue('phone', profile.phone, { shouldValidate: true });
        }
    }, [ profile ]);

    useLayoutEffect(() => {
        isFirstRenderState && setIsFirstRenderState(false);
    }, []);

    return (
        <div { ...props }>
            <TitlePage>{t('pages.orderDetails.title')}</TitlePage>
            <Form.Root { ...form }>
                <form
                    onSubmit = { form.handleSubmit(onSubmit) }>
                    <div className = { `flex flex-col gap-[34px]
                        sb:gap-[48px]` }>
                        <div>
                            <FormTitle>
                                <span className = 'text-quaternary'>1.</span> {t('pages.orderDetails.firstTitleForm')}
                            </FormTitle>
                            <ContainerFields>
                                <Form.FormField
                                    control = { form.control }
                                    name = 'firstName'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.firstName') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                        </Form.FormItem>
                                    ) }
                                />
                                <Form.FormField
                                    control = { form.control }
                                    name = 'lastName'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.lastName') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                        </Form.FormItem>
                                    ) }
                                />
                                <Form.FormField
                                    control = { form.control }
                                    name = 'phone'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.phone') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                        </Form.FormItem>
                                    ) }
                                />
                                <Form.FormField
                                    control = { form.control }
                                    name = 'email'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.email') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                        </Form.FormItem>
                                    ) }
                                />
                            </ContainerFields>
                        </div>
                        <div>
                            <FormTitle>
                                <span className = 'text-quaternary'>2.</span> {t('pages.orderDetails.secondTitleForm')}
                            </FormTitle>
                            <ContainerFields>
                                <Form.FormField
                                    control = { form.control }
                                    name = 'city'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.city') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                            {(form.getFieldState('city').invalid || isLoadingFetchCitiesNewPost) && (
                                                <ScrollArea
                                                    className = 'h-[50vh] w-full p-4'
                                                    propViewport = {{}}>
                                                    <NotData
                                                        isLoading = { isLoadingFetchCitiesNewPost }
                                                        t = { t }>
                                                        {cities?.map((city) => (
                                                            <Button
                                                                className = 'flex-col'
                                                                key = { city.CityID }
                                                                variant = 'outline'
                                                                onClick = { () => onClickCityHandler(city) }>
                                                                <p>UA: <span className = 'text-quaternary'>{city.Description}</span></p>
                                                                <p>RU: <span className = 'text-quaternary'>{city.DescriptionRu}</span></p>
                                                            </Button>
                                                        ))}
                                                    </NotData>
                                                </ScrollArea>
                                            )}
                                        </Form.FormItem>
                                    ) }
                                />
                                <Form.FormField
                                    control = { form.control }
                                    name = 'warehouse'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Input
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.choosePostOffice') }
                                                    { ...field }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                            {(form.getFieldState('warehouse').invalid || isLoadingFetchWarehousesNewPost || isOpenWarehouseState) && (
                                                <ScrollArea
                                                    className = 'h-[50vh] w-full p-4'
                                                    propViewport = {{}}>
                                                    <NotData
                                                        isLoading = { isLoadingFetchWarehousesNewPost }
                                                        t = { t }>
                                                        {warehouses?.map((warehouse) => (
                                                            <Button
                                                                className = 'flex-col'
                                                                key = { warehouse.SiteKey }
                                                                variant = 'outline'
                                                                onClick = { () => onClickWarehouseHandler(warehouse) }>
                                                                <p>UA: <span className = 'text-quaternary'>{warehouse.Description}</span></p>
                                                                <p>RU: <span className = 'text-quaternary'>{warehouse.DescriptionRu}</span></p>

                                                            </Button>
                                                        ))}
                                                    </NotData>
                                                </ScrollArea>
                                            )}
                                        </Form.FormItem>
                                    ) }
                                />
                                <Form.FormField
                                    control = { form.control }
                                    name = 'comment'
                                    render = { ({ field, fieldState }) => (
                                        <Form.FormItem>
                                            <Form.FormControl>
                                                <Textarea
                                                    { ...field }
                                                    isValidate = { fieldState.invalid }
                                                    placeholder = { t('placeholders.comment') }
                                                />
                                            </Form.FormControl>
                                            <Form.FormMessage t = { t } />
                                        </Form.FormItem>
                                    ) }
                                />
                            </ContainerFields>
                        </div>
                        <div>
                            {/* <div className = { `border-y-2 border-tertiary-100/10 py-[18px] mb-[18px]
                                sb:py-[32px] sb:mb-[32px]` }>
                                <div className = 'flex justify-between flex-wrap'>
                                    <FormTitle>
                                        {t('pages.orderDetails.yourOrder')}
                                    </FormTitle>
                                    <FormTitle className = 'text-quaternary'>
                                        {currentOrder ? currentOrder.orderedProducts.reduce(
                                            (acc, orderedProducts) => acc + orderedProducts.price,
                                            0,
                                        ) : 0} ₴
                                    </FormTitle>
                                </div>
                                <div className = 'flex justify-between flex-wrap'>
                                    <FormTitle>
                                        Shipping
                                    </FormTitle>
                                    <FormTitle className = 'text-quaternary'>
                                        80 ₴
                                    </FormTitle>
                                </div>
                            </div> */}
                            <div className = 'flex justify-between flex-wrap'>
                                <FormTitle className = 'mb-0 sb:mb-0 text-quaternary uppercase'>
                                    {t('pages.common.total')}
                                </FormTitle>
                                <FormTitle className = 'mb-0 sb:mb-0 text-quaternary'>
                                    {totalPriceState} ₴
                                </FormTitle>
                            </div>
                        </div>
                        <Button
                            className = 'capitalize'
                            isLoading = { isLoadingFetchCreateOrder }
                            type = 'submit'
                            variant = 'contain'>
                            {t('pages.orderDetails.buttonMakeOrder')}
                        </Button>
                    </div>
                </form>
            </Form.Root>
        </div>
    );
};
