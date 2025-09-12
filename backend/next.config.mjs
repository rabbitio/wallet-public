import i18NextConfig from "./next-i18next.config.cjs";

/* i18next doesn't auto-recognize .cjs file extension.
 * And we cannot use .js config due to type: "module" in package.json.
 * So here we explicitly set the file name of i18next config so i18next will find it.
 */
process.env.I18NEXT_DEFAULT_CONFIG_PATH = "./next-i18next.config.cjs";

const nextConfig = {
    /*
     * We use base path because of custom server that is backend of Rabbit Wallet.
     * We can remove this if we make Rabbit Swaps next.js app a dedicated service.
     */
    basePath: "/swap",
    /*
     * Next.js have issues working with transpiled code.
     * So we ask next.js to transpile raw source code from our lib.
     */
    transpilePackages: ["@rabbitio/ui-kit"],
    /*
     * Allows loading initialization scripts for next. See instrumentation.js
     */
    experimental: { instrumentationHook: true },
    /*
     * i18next wants its config to be a dedicated file.
     * So we created it and just put its content here.
     */
    ...i18NextConfig,
    /*
     * Controlling dev mode pages reloading - https://github.com/vercel/next.js/issues/29184
     */
    onDemandEntries: {
        // period (in ms) where the server will keep pages in the buffer
        maxInactiveAge: 60 * 60 * 1000,
        // number of pages that should be kept simultaneously without being disposed
        pagesBufferLength: 100,
    },
};

export default nextConfig;
