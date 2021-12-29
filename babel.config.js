module.exports = {
    babelrcRoots: [
        "./src",
        "./backend",
    ],
    presets: ["react-app"],
    plugins: [
        "@babel/plugin-proposal-class-properties",
        "dynamic-import-node"
    ]
};
