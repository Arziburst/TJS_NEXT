"use client"

// Core
import React, { FC, Suspense, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useSearchParams, useRouter } from 'next/navigation';


// Init
import { CATEGORIES_ITEMS } from '@/lib';

// Tools
import { cn } from '@/tools/lib/utils';
import { useCustomTranslation } from '@/tools/hooks';

// Bus
import { useTogglesRedux } from '@/bus/client/toggles';
import { useGallery } from '@/bus/gallery';
import { useProducts } from '@/bus/products';

// Book
import { BOOK, PARAMS_VALUES } from '@/lib/book';

// Components
import {
    Form,
    Icons,
    Select,
} from '@/view/components';

// Elements
import {
    Button,
    FormTitle,
    Image,
    Input,
    Switch,
    Textarea,
} from '@/view/elements';

// Styles
import S from './(root)/styles.module.css';

// Static
import { validationForm, defaultValues, minLengthImages, minPrice } from './(root)/static';
import { ModalAddImages } from './(root)/ModalAddImages';

// Types
import { Image as ImageType } from '@/bus/gallery/types';

const ManagementPage = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id");

    const { t } = useCustomTranslation();

    const isModeEdit = !!id;

    const { togglesRedux: {
        isLoadingCreteProduct,
        isLoadingEditProduct,
        isLoadingDeleteProduct,
        isLoadingFetchGallery,
        isLoadingDeleteItemGallery,
        isLoadingUpdateGallery,
    } } = useTogglesRedux();

    const { fetchGallery } = useGallery();
    const {
        products: { currentProduct },
        fetchProduct,
        fetchCreateNewProduct,
        fetchDeleteProduct,
        fetchEditProduct,
    } = useProducts();

    const form = useForm({
        resolver: yupResolver(validationForm),
        defaultValues: isModeEdit ? currentProduct || defaultValues : defaultValues,
    });

    const { images } = form.getValues();
    form.watch('images');

    const isValidateInputImages = images.length > 0;

    const onClickAddItemGalleryToManagementHandler = (event: any, image: ImageType) => {
        const oldImages = form.getValues().images;

        if (!oldImages.includes(image.imageUrl)) {
            const result = oldImages.length > 0 ? [...oldImages, image.imageUrl] : [image.imageUrl];
            form.setValue('images', result, { shouldDirty: true, shouldTouch: true, shouldValidate: true });

            return;
        }

        form.setValue('images', oldImages.filter((img) => img !== image.imageUrl), { shouldDirty: true, shouldTouch: true });
    };

    const onClickDeleteItemHandler = (_id?: string) => {
        const isConfirmed = window.confirm(t('pages.management.confirmCompleteDeletion'));
        if (!isConfirmed) return;
        const isConfirmedTwice = window.confirm(t('pages.management.confirmCompleteDeletionTwice'));
        if (!isConfirmedTwice) return;

        if (_id) {
            fetchDeleteProduct({
                _id,
                redirect: () => router.push(BOOK.SHOP)
            });
        }
    };

    const onClickDeleteImageFromProductHandler = (src: ImageType['imageUrl']) => {
        if (isValidateInputImages) {
            const newImages = images.filter((oldSrc) => oldSrc !== src);
            form.setValue('images', newImages);
        }
    };

    const onSubmit = (values: any) => {
        if (isModeEdit && currentProduct) {
            fetchEditProduct({
                _id: currentProduct._id,
                editedProduct: values,
            });

            return;
        }

        fetchCreateNewProduct({
            ...values,
            reset: form.reset,
        });
        // navigate(`${BOOK.SHOP}/${values.type}`);
    };

    useEffect(() => {
        fetchGallery();
        id && fetchProduct(id);
    }, []);

    useEffect(() => {
        currentProduct && form.reset({
            available: currentProduct.available,
            description: currentProduct.description,
            images: currentProduct.images,
            price: currentProduct.price,
            title: currentProduct.title,
            type: currentProduct.type,
            weight: currentProduct.weight,
        });
    }, [currentProduct]);

    useEffect(() => {
        if (!isModeEdit) {
            form.reset(defaultValues);
        }
    }, [location]);

    return (
        <div>
            <Form.Root {...form}>
                <FormTitle className='text-center'>
                    {t('pages.management.title')}
                </FormTitle>
                <form
                    className={S.grid}
                    onSubmit={form.handleSubmit(onSubmit)}>
                    <Form.FormField
                        control={form.control}
                        name='title'
                        render={({ field, fieldState }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel>
                                    {t('pages.management.labelTitle')}:
                                </Form.FormLabel>
                                <Form.FormControl>
                                    <Input
                                        isValidate={fieldState.invalid}
                                        placeholder={t('placeholders.someData')}
                                        {...field}
                                    />
                                </Form.FormControl>
                                <Form.FormMessage t={t} />
                            </Form.FormItem>
                        )}
                    />
                    <Form.FormField
                        control={form.control}
                        name='type'
                        render={({ field }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel>
                                    {t('pages.management.labelType')}:
                                </Form.FormLabel>
                                <Select.Root
                                    defaultValue={field.value}
                                    onValueChange={field.onChange}>
                                    <Form.FormControl>
                                        <Select.SelectTrigger
                                            variant='outline'>
                                            <Select.SelectValue>
                                                <span className='capitalize'>
                                                    {t(`categories.${String(field.value).toLocaleLowerCase()}`)}
                                                </span>
                                            </Select.SelectValue>
                                        </Select.SelectTrigger>
                                    </Form.FormControl>
                                    <Select.SelectContent
                                        variant='shadow'>
                                        {CATEGORIES_ITEMS.map((item) => (
                                            <Select.SelectItem
                                                className='capitalize'
                                                key={item}
                                                value={item}
                                                variant='contain'>
                                                {t(`categories.${item}`)}
                                            </Select.SelectItem>
                                        ))}
                                    </Select.SelectContent>
                                </Select.Root>
                                <Form.FormMessage t={t} />
                            </Form.FormItem>
                        )}
                    />
                    <Form.FormField
                        control={form.control}
                        name='description'
                        render={({ field, fieldState }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel>
                                    {t('pages.management.labelDescription')}:
                                </Form.FormLabel>
                                <Form.FormControl>
                                    <Textarea
                                        {...field}
                                        isValidate={fieldState.invalid}
                                        placeholder={t('placeholders.someData')}
                                    />
                                </Form.FormControl>
                                <Form.FormMessage t={t} />
                            </Form.FormItem>
                        )}
                    />
                    <Form.FormField
                        control={form.control}
                        name='weight'
                        render={({ field, fieldState }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel>
                                    {t('pages.management.labelWeight')}:
                                </Form.FormLabel>
                                <Form.FormControl>
                                    <Input
                                        isValidate={fieldState.invalid}
                                        placeholder={t('placeholders.someData')}
                                        type='number'
                                        {...field}
                                    />
                                </Form.FormControl>
                                <Form.FormMessage t={t} />
                            </Form.FormItem>
                        )}
                    />
                    <Form.FormField
                        control={form.control}
                        name='price'
                        render={({ field, fieldState }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel>
                                    {t('pages.management.labelPrice')}:
                                </Form.FormLabel>
                                <Form.FormControl>
                                    <Input
                                        isValidate={fieldState.invalid}
                                        placeholder={t('placeholders.someData')}
                                        type='number'
                                        {...field}
                                    />
                                </Form.FormControl>
                                <Form.FormMessage
                                    options={{ index: minPrice }}
                                    t={t}
                                />
                            </Form.FormItem>
                        )}
                    />
                    <Form.FormField
                        control={form.control}
                        name='available'
                        render={({ field }) => (
                            <Form.FormItem style={{ gridArea: field.name }}>
                                <Form.FormLabel className='block'>
                                    {t('pages.management.labelAvailable')}
                                </Form.FormLabel>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}>
                                    {field.value ? t('pages.management.availability') : t('pages.management.nonAvailability')}
                                </Switch>
                                <Form.FormMessage t={t} />
                            </Form.FormItem>
                        )}
                    />
                    <div style={{ gridArea: 'images' }}>
                        <Form.FormField
                            control={form.control}
                            name='images'
                            render={({ fieldState }) => (
                                <Form.FormItem>
                                    <Form.FormControl>
                                        <div className={cn({ 'flex flex-wrap [&_*]:h-[132px] gap-3 max-sb:justify-center': isValidateInputImages })}>
                                            <ModalAddImages
                                                classNameTrigger={cn({ 'border-quaternary text-quaternary': fieldState.invalid })}
                                                isLoading={
                                                    isLoadingDeleteItemGallery
                                                    || isLoadingFetchGallery
                                                    || isLoadingUpdateGallery
                                                }
                                                selectedImages={images}
                                                t={t}
                                                onClickAddItemGalleryToManagementHandler={
                                                    onClickAddItemGalleryToManagementHandler
                                                }
                                            />
                                            {isValidateInputImages && images.map((src) => src && (
                                                <Button
                                                    className={`group w-auto relative border-2 border-transparent overflow-hidden
                                                        hover:border-quaternary hover:opacity-100
                                                        after:absolute-center after:w-full after:h-full content-['1'] after:bg-secondary` }
                                                    key={src}
                                                    type='button'
                                                    variant='default'
                                                    onClick={() => onClickDeleteImageFromProductHandler(src)}>
                                                    <Icons.DeleteItem
                                                        className={`h-[80px] absolute-center stroke-quaternary opacity-0 transition
                                                            group-hover:opacity-100` }
                                                        height='80'
                                                    />
                                                    <Image
                                                        alt={t('pages.management.altImageFromGallery')}
                                                        className='aspect-square'
                                                        src={src}
                                                    />
                                                </Button>
                                            ))}
                                        </div>
                                    </Form.FormControl>
                                    <Form.FormMessage
                                        options={{ index: minLengthImages }}
                                        t={t}
                                    />
                                </Form.FormItem>
                            )}
                        />
                    </div>
                    <div className="flex  gap-4">
                        <Button
                            className='max-w-[300px]'
                            isLoading={isModeEdit ? isLoadingEditProduct : isLoadingCreteProduct}
                            style={{ gridArea: 'submit' }}
                            type='submit'
                            variant='contain'>
                            {isModeEdit ? t('buttons.edit') : t('buttons.create')}
                        </Button>
                        {isModeEdit && (
                            <Button
                                className='max-w-[300px]'
                                isLoading={isLoadingDeleteProduct}
                                style={{ gridArea: 'delete' }}
                                type='button'
                                variant='outline'
                                onClick={() => onClickDeleteItemHandler(currentProduct?._id)}>
                                {t('buttons.remove')}
                            </Button>
                        )}
                        <Button
                            className='max-w-[300px]'
                            style={{ gridArea: 'submit' }}
                            type='button'
                            onClick={() => router.back()}
                            variant='contain'>
                            {t('buttons.goBack')}
                        </Button>
                    </div>
                </form>
            </Form.Root>
        </div>
    );
};

export default function Managment() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ManagementPage />
        </Suspense>
    );
}