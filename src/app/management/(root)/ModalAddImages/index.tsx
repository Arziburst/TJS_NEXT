// Core
import React, { FC, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { TFunction } from 'i18next';

// Tools
import { cn } from '@/tools/lib/utils';

// Bus
import { useGallery } from '@/bus/gallery';

// Components
import { Dialog } from '@/view/components';

// Elements
import {
    Button,
    Image,
} from '@/view/elements';

// Types
import { Image as ImageType } from '@/bus/gallery/types';

type PropTypes = {
    isLoading: boolean;
    t: TFunction;
    onClickAddItemGalleryToManagementHandler: (event: any, image: ImageType) => void;
    selectedImages: (string | undefined)[];
    classNameTrigger?: string;
}

export const ModalAddImages: FC<PropTypes> = ({
    isLoading,
    t,
    onClickAddItemGalleryToManagementHandler,
    selectedImages,
    classNameTrigger,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        gallery: { gallery },
        onChangeInputGallery,
        fetchGallery,
        fetchDeleteItemOfGallery,
    } = useGallery();

    const onClickDeleteItemGalleryHandler = (event: any, image: ImageType) => {
        const isConfirmed = window.confirm(t('pages.management.confirmCompleteDeletion'));
        if (isConfirmed) {
            fetchDeleteItemOfGallery(image.public_id);
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    useEffect(() => {
        fetchGallery();
    }, []);

    return (
        <Dialog.Root>
            <Dialog.DialogTrigger
                asChild
                className={cn('min-h-[132px] p-[20px]', { 'w-auto aspect-square': selectedImages.length > 0 }, classNameTrigger)}>
                <Button variant='outline'>
                    {t('pages.management.buttonAddImageFromGallery')}
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent className='max-h-screen overflow-x-auto'>
                <Dialog.DialogHeader>
                    <div>
                        <Dialog.DialogTitle className="text-2xl font-semibold p-2">
                            {t('pages.management.galery')}
                        </Dialog.DialogTitle>
                        <input
                            ref={fileInputRef}
                            multiple
                            type='file'
                            onChange={onChangeInputGallery}
                            className="hidden"
                        />
                        <Button
                            type='button'
                            className='w-100% p-2'
                            onClick={handleButtonClick}
                        >
                            {t('pages.management.openFileDialog')}
                        </Button>
                    </div>
                </Dialog.DialogHeader>
                <Dialog.DialogFooter>
                    <div className='flex flex-wrap gap-3'>
                        {gallery?.map((image) => (
                            <div className="relative" key={image.public_id}>
                                {selectedImages.includes(image.imageUrl) && (
                                    <div
                                        onClick={(event) => onClickAddItemGalleryToManagementHandler(event, image)}
                                        className="absolute top-0 left-0 w-full h-full bg-quinary opacity-50 z-20 flex items-center justify-center"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-16 h-16 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>

                                )}
                                <Button
                                    style={{ border: "1px solid #FF614A", color: "#FF614A" }}
                                    className="absolute z-10 p-1 top-0 right-0 w-auto h-6 flex items-center justify-center bg-white shadow-md"
                                    isLoading={isLoading}
                                    variant="default"
                                    onClick={(event) => onClickDeleteItemGalleryHandler(event, image)}
                                >
                                    {t('buttons.remove')}
                                </Button>
                                <Button
                                    className={cn('w-auto border-2 border-transparent', { 'border-quinary': selectedImages.includes(image.imageUrl) })}
                                    variant="default"
                                    onClick={(event) => onClickAddItemGalleryToManagementHandler(event, image)}
                                >
                                    <Image
                                        alt={t('altImages.imageByURL', { url: image.imageUrl })}
                                        className="h-32 aspect-square"
                                        src={image.imageUrl}
                                    />
                                </Button>
                            </div>
                        ))}
                    </div>
                </Dialog.DialogFooter>
                <Dialog.DialogClose asChild>
                    <Button
                        type='button'
                        className='w-100% p-2'
                    >
                        {t('pages.management.continueEditing')}
                    </Button>
                </Dialog.DialogClose>
            </Dialog.DialogContent>
        </Dialog.Root>
    );
};
