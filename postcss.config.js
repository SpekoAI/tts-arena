/** @type {import('postcss-load-config').Config} */
// package.json has "type": "module", so this .js file is ESM — use export default.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
