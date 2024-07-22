// Core
import { toast } from 'react-toastify';

// Constants
import { typesOfImage } from '@/init';

// Tools
import { useDispatch, useSelector } from '../../tools/hooks'; /* Typed selector */

// Slice
import { galleryActions } from './slice';

// Types
import * as types from './types';

// MarkerGen middleware
import { useGallerySaga } from './saga'; /* Choose one technology, Saga or Thunk */

export const useGallery = () => {
    // MarkerGen api hook
    const gallerySagas = useGallerySaga();  /* Saga api hook */

    const dispatch = useDispatch();
    const gallery = useSelector((state) => state.gallery);

    // useEffect(() => {
    //     // MarkerGen use api hook
    //     fetchGallery();
    // }, []);

    return {
        gallery,
        setGallery:           (payload: types.Gallery) => dispatch(galleryActions.setGallery(payload)),
        onChangeInputGallery: (event: React.ChangeEvent<HTMLInputElement> | any) => { // todo remove any
            const errors: Array<string> = [];
            let formData = new FormData();
            const files = Array.from(event.target.files);

            files.forEach((file: any, i) => {
                if (typesOfImage.every((type) => file.type !== type)) {
                    errors.push(`'${file.type}' is not a supported format`);
                }

                if (file.size > 1000000) {
                    errors.push(`Name:'${file.name}', size:'${file.size}' is too large, please pick a smaller file`);
                }

                formData.append(`${i}`, file);
            });

            if (errors.length > 0) {
                return errors.forEach((error) => toast.error(error));
            }
            gallerySagas.fetchUpdateGallery(formData);
        },
        ...gallerySagas,
    };
};
