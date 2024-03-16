const nextConfig = {
    basePath: "/swap",
    transpilePackages: ["@rabbitio/ui-kit"],
    i18n: {
        // These are all the locales you want to support in your application
        locales: ["en"],
        // This is the default locale you want to be used when visiting a non-locale prefixed path
        defaultLocale: "en",
    },
    experimental: { instrumentationHook: true },
}

export default nextConfig;
