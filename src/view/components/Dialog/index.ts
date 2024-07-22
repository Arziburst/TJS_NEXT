// Core
import * as DialogPrimitive from '@radix-ui/react-dialog';

// Part of component
import { DialogContent } from './DialogContent';
import { DialogDescription } from './DialogDescription';
import { DialogFooter } from './DialogFooter';
import { DialogHeader } from './DialogHeader';
import { DialogOverlay } from './DialogOverlay';
import { DialogPortal } from './DialogPortal';
import { DialogTitle } from './DialogTitle';

export const Dialog = {
    Root:          DialogPrimitive.Root,
    DialogTrigger: DialogPrimitive.Trigger,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
};

