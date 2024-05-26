const webpack = require("webpack");

// Hacking the webpack 5 removal of polyfills, see details here https://github.com/facebook/create-react-app/issues/11756
// And here: https://web3auth.io/docs/troubleshooting/webpack-issues#react-create-react-app
module.exports = function override(config) {
    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
        crypto: false,
        stream: require.resolve("stream-browserify"),
        querystring: require.resolve("querystring-es3"),
        assert: false, // require.resolve("assert") can be polyfilled here if needed
        http: false, // require.resolve("stream-http"),
        https: false, // require.resolve("https-browserify") can be polyfilled here if needed
        os: false, // require.resolve("os-browserify") can be polyfilled here if needed
        url: false, // require.resolve("url") can be polyfilled here if needed
        zlib: false, // require.resolve("browserify-zlib") can be polyfilled here if needed
        timers: false
    });
    config.resolve.fallback = fallback;
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: "process/browser",
            Buffer: ["buffer", "Buffer"],
        }),
    ]);
    config.ignoreWarnings = [/Failed to parse source map/];
    config.module.rules.push({
        test: /\.(js|mjs|jsx)$/,
        enforce: "pre",
        loader: require.resolve("source-map-loader"),
        resolve: {
            fullySpecified: false,
        },
    });
    return config;
};
