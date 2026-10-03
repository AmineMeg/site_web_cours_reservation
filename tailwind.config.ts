import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: colors.red,
        accent: colors.amber,
      },
    },
  },
  plugins: [],
};

export default config;
