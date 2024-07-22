// Core
import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { i18n, TFunction } from 'i18next';

// Tools
import { cn } from '@/tools/lib/utils';

// Components
import { Header } from '@/view/components';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = ({
    ...props
}: SheetPrimitive.DialogPortalProps) => (
    <SheetPrimitive.Portal
        { ...props }
    />
);
SheetPortal.displayName = SheetPrimitive.Portal.displayName;

const SheetOverlay = React.forwardRef<
React.ElementRef<typeof SheetPrimitive.Overlay>,
React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Overlay
        className = { cn(
            'fixed inset-0 z-50 bg-primary-200/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            className,
        ) }
        { ...props }
        ref = { ref }
    />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
    'fixed z-50 flex flex-col bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
    {
        variants: {
            side: {
                top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
                bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
                left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
                right:
          'inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
            },
        },
        defaultVariants: {
            side: 'right',
        },
    },
);

interface SheetContentProps
    extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
    t: TFunction;
    i18n: i18n;
    onClickCloseSideBar: () => void;
}

const SheetContent = React.forwardRef<
React.ElementRef<typeof SheetPrimitive.Content>,
SheetContentProps
>(({ t, i18n, side = 'left', className, children, onClickCloseSideBar, ...props }, ref) => {
    return (
        <SheetPortal>
            <SheetOverlay onClick = { onClickCloseSideBar } />
            <SheetPrimitive.Content
                className = { cn(sheetVariants({ side }), className, 'w-full overflow-y-auto') }
                ref = { ref }
                { ...props }>
                <Header
                    i18n = { i18n }
                    t = { t }
                    variant = 'close'
                />
                {children}
            </SheetPrimitive.Content>
        </SheetPortal>
    );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className = { cn(
            'flex flex-col space-y-2',
            className,
        ) }
        { ...props }
    />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className = { cn(
            '',
            className,
        ) }
        { ...props }
    />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
React.ElementRef<typeof SheetPrimitive.Title>,
React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Title
        className = { cn('text-lg font-semibold text-foreground', className) }
        ref = { ref }
        { ...props }
    />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
React.ElementRef<typeof SheetPrimitive.Description>,
React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Description
        className = { cn('text-sm text-muted-foreground', className) }
        ref = { ref }
        { ...props }
    />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
    Sheet,
    SheetTrigger,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
};
