/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Geist", "Inter", "system-ui", "-apple-system", "sans-serif"],
                mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
            },
            colors: {
                ink: "#171717",
                "on-primary": "#ffffff",
                body: "#4d4d4d",
                mute: "#888888",
                hairline: "#ebebeb",
                "hairline-strong": "#a1a1a1",
                canvas: "#ffffff",
                "canvas-soft": "#fafafa",
                "canvas-soft-2": "#f5f5f5",
                link: "#0070f3",
                "link-deep": "#0761d1",
                "link-bg-soft": "#d3e5ff",
                success: "#0070f3",
                error: "#ee0000",
                "error-soft": "#f7d4d6",
                "error-deep": "#c50000",
                warning: "#f5a623",
                "warning-soft": "#ffefcf",
                "warning-deep": "#ab570a",
                violet: "#7928ca",
                "violet-soft": "#d8ccf1",
                "violet-deep": "#4c2889",
                cyan: "#50e3c2",
                "cyan-soft": "#aaffec",
                "cyan-deep": "#29bc9b",
                "highlight-pink": "#ff0080",
                "highlight-magenta": "#eb367f",
                "gradient-develop-start": "#007cf0",
                "gradient-develop-end": "#00dfd8",
                "gradient-preview-start": "#7928ca",
                "gradient-preview-end": "#ff0080",
                "gradient-ship-start": "#ff4d4d",
                "gradient-ship-end": "#f9cb28",
            },
            fontSize: {
                "display-xl": ["48px", { lineHeight: "48px", letterSpacing: "-2.4px", fontWeight: "600" }],
                "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-1.28px", fontWeight: "600" }],
                "display-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.96px", fontWeight: "600" }],
                "display-sm": ["20px", { lineHeight: "28px", letterSpacing: "-0.6px", fontWeight: "600" }],
                "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
                "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
                "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "-0.28px", fontWeight: "400" }],
            },
            borderRadius: {
                xs: "4px",
                sm: "6px",
                md: "8px",
                lg: "12px",
                xl: "16px",
                "pill-sm": "64px",
                pill: "100px",
            },
            maxWidth: {
                page: "1400px",
            },
            spacing: {
                section: "192px",
            },
            boxShadow: {
                "elevation-1": "inset 0 0 0 1px rgba(0,0,0,0.08)",
                "elevation-2":
                    "0px 1px 1px rgba(0,0,0,0.02), 0px 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)",
                "elevation-3":
                    "0px 2px 2px rgba(0,0,0,0.04), 0px 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)",
                "elevation-4":
                    "0px 2px 2px rgba(0,0,0,0.04), 0px 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)",
                "elevation-5":
                    "0px 1px 1px rgba(0,0,0,0.02), 0px 8px 16px -4px rgba(0,0,0,0.04), 0px 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)",
            },
            animation: {
                blink: "blink 1s step-end infinite",
                "mesh-drift": "meshDrift 20s ease-in-out infinite alternate",
            },
            keyframes: {
                blink: {
                    "50%": { opacity: "0" },
                },
                meshDrift: {
                    "0%": { transform: "translate(-2%, -1%) scale(1.02)" },
                    "100%": { transform: "translate(2%, 1%) scale(1.05)" },
                },
            },
        },
    },
    plugins: [],
};
