module.exports = {
    require: ["@babel/register", "babel-polyfill", "test/integration/setup.js"],
    reporter: "mochawesome",
    timeout: "900000",
    exit: true,
    recursive: true,
};
