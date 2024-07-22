// Core
import tailwindcssAnimate from "tailwindcss-animate";

// Assets
import { fonts, screens } from "./src/assets/themes";

// Types
import { Config } from "tailwindcss/types";

// Config
export default {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    darkMode: ["class"],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            screens: {
                ...screens,
            },
            gap: {
                "between-items-of-header": "70px",
            },
            colors: {
                border: {
                    DEFAULT: "var(--border)",
                    100: "var(--border_100)",
                },
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "var(--background)",
                foreground: "hsl(var(--foreground))",

                primary: {
                    DEFAULT: "var(--primary)",
                    100: "var(--primary_100)",
                    200: "var(--primary_200)",
                },
                secondary: {
                    DEFAULT: "var(--secondary)",
                    100: "var(--secondary_100)",
                    200: "var(--secondary_200)",
                    300: "var(--secondary_300)",
                },
                tertiary: {
                    DEFAULT: "var(--tertiary)",
                    100: "var(--tertiary_100)",
                    200: "var(--tertiary_200)",
                },
                quaternary: {
                    DEFAULT: "var(--quaternary)",
                },
                quinary: {
                    DEFAULT: "var(--quinary)",
                    100: "var(--quinary_100)",
                },
                senary: {
                    DEFAULT: "var(--senary)",
                },

                // todo remove
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: fonts.family,
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [tailwindcssAnimate],
} satisfies Config;
