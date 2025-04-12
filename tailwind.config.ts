import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}", // If using pages directory
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // Standard components folder
    "./app/**/*.{js,ts,jsx,tsx,mdx}", // App router directory
    // Add other paths if necessary
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      // Add custom theme extensions here
    },
  },
  plugins: [],
};
export default config;
