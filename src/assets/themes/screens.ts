// Types
type SCREENS = {
    [key: string]: string
};

export enum SCREENS_NUMBER {
    SM = 640,
    MD = 768,
    SB = 1024, // for SideBar
    '3xl' = 2000,
}

export const screensUnit = 'px';


export const screens: SCREENS = {
    sb:    SCREENS_NUMBER.SB + screensUnit,
    '3xl': SCREENS_NUMBER[ '3xl' ] + screensUnit,
};
