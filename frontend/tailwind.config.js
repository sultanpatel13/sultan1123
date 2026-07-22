/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                display: ["Outfit", "sans-serif"],
                body: ["Space Grotesk", "sans-serif"],
            },
            colors: {
                night: "#070816",
                aurora: "#47d7ff",
                violet: "#8a5cff",
                pulse: "#15f5ba",
                cloud: "#eef4ff",
            },
            boxShadow: {
                neon: "0 0 24px rgba(71, 215, 255, 0.35)",
                glass: "0 24px 70px rgba(6, 10, 30, 0.45)",
            },
            backgroundImage: {
                "grid-fade":
                    "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            },
            animation: {
                float: "float 7s ease-in-out infinite",
                pulseRing: "pulseRing 2.2s ease-in-out infinite",
                drift: "drift 18s linear infinite",
                blink: "blink 1s step-end infinite",
            },
            keyframes: {
                float: {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%": { transform: "translateY(-14px)" },
                },
                pulseRing: {
                    "0%": { boxShadow: "0 0 0 0 rgba(71, 215, 255, 0.45)" },
                    "70%": { boxShadow: "0 0 0 18px rgba(71, 215, 255, 0)" },
                    "100%": { boxShadow: "0 0 0 0 rgba(71, 215, 255, 0)" },
                },
                drift: {
                    "0%": { transform: "translate3d(0, 0, 0)" },
                    "50%": { transform: "translate3d(28px, -24px, 0)" },
                    "100%": { transform: "translate3d(0, 0, 0)" },
                },
                blink: {
                    "50%": { opacity: "0" },
                },
            },
        },
    },
    plugins: [],
};
