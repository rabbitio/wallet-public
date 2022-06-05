module.exports = {
    babelrcRoots: ["./src", "./backend"],
    presets: ["react-app"],
    plugins: [
        "@babel/plugin-proposal-class-properties",
        "@babel/plugin-proposal-private-methods",
        "@babel/plugin-proposal-private-property-in-object",
        "dynamic-import-node",
    ],
};
