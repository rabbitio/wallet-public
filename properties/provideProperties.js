/**
 * This script copies required client and server properties to properties files used by app.
 * It is designed to be just imported (case of usage in script starting/building/testing React App) or manually.
 *
 * To run it manually pass PROP_ENV variable (with one of values: local,prod,unit_tests,integration_tests) and just call
 *   >node provideProperties.js
 *   Whole run script can be: >export PROP_ENV=local && node provideProperties.js
 */
const fsExtra = require("fs-extra");
const path = require("path");

const reactEnv = process.env.NODE_ENV;
const propEnv = process.env.PROP_ENV;

// These properties should be set as a GitLab variable, format is "PROPERTY_NAME1=VALUE1,PROPERTY_NAME2=VALUE2"
const secureProdProperties = process.env.SECURE_PROD_PROPERTIES;

const targetClientPropertiesPath = path.join(__dirname, "../src/properties.js");
let targetServerPropertiesPath = path.join(__dirname, "../backend/src/properties.js");
const targetServerPropertiesPathForIntegrationTests = path.join(__dirname, "../test/integration/server-properties.js");
const targetServerLoggingPropertiesPath = path.join(__dirname, "../backend/src/log4js.json");

let environmentPrefix = "";
if (propEnv === "local") {
    environmentPrefix = "local";
} else if (reactEnv === "development" || propEnv === "dev") {
    environmentPrefix = "local";
} else if (reactEnv === "production" || propEnv === "prod") {
    environmentPrefix = "prod";
} else if (reactEnv === "integration_tests" || propEnv === "integration_tests") {
    environmentPrefix = "integration_tests";
} else if (reactEnv === "test" || propEnv === "unit_tests") {
    environmentPrefix = "unit_tests";
} else {
    throw new Error(
        "Provide correct env variable:" +
            "\n  - NODE_ENV when calling from react scripts" +
            "\n  - PROP_ENV when calling manually:" +
            "\n      >cross-env PROP_ENV=local && node provideProperties.js" +
            "\nMaybe also you should correct this script to support other environments."
    );
}

const sourceClientPropertiesPath = path.join(__dirname, `../properties/client/envs/${environmentPrefix}.js`);
const sourceServerPropertiesPath = path.join(__dirname, `../properties/server/envs/${environmentPrefix}.js`);
const sourceServerLoggingPropertiesPath = path.join(
    __dirname,
    `../properties/server/logging/${environmentPrefix}-log4js.json`
);

// eslint-disable-next-line no-console
console.log(`Copying client ${sourceClientPropertiesPath} to ${targetClientPropertiesPath}.`);
fsExtra.copySync(sourceClientPropertiesPath, targetClientPropertiesPath);

// eslint-disable-next-line no-console
console.log(`Copying server ${sourceServerPropertiesPath} to ${targetServerPropertiesPath}.`);
fsExtra.copySync(sourceServerPropertiesPath, targetServerPropertiesPath);

if (environmentPrefix === "integration_tests") {
    // eslint-disable-next-line no-console
    console.log(
        `Copying server ${sourceServerPropertiesPath} to ${targetServerPropertiesPathForIntegrationTests} for integration tests.`
    );
    fsExtra.copySync(sourceServerPropertiesPath, targetServerPropertiesPathForIntegrationTests);
}

// eslint-disable-next-line no-console
console.log(`Copying server logging ${sourceServerLoggingPropertiesPath} to ${targetServerLoggingPropertiesPath}.`);
fsExtra.copySync(sourceServerLoggingPropertiesPath, targetServerLoggingPropertiesPath);

if (environmentPrefix === "prod") {
    (async () => {
        try {
            await fillSecureProperties(targetServerPropertiesPath, secureProdProperties);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Failed to add production properties or GTAG", e);
        }
    })();
}

async function fillSecureProperties(propertiesFile, propertiesString) {
    let data = null;
    try {
        data = await fsExtra.readFile(propertiesFile, "utf8");
    } catch (e) {
        // eslint-disable-next-line no-console
        return console.log("Failed to read file to be filled with hidden credentials", e);
    }

    const propertiesMap = (propertiesString || "").split("###").map(item => {
        const parts = item.split("=");
        return [
            parts[0].trim(),
            parts
                .slice(1)
                .join("=")
                .trim(),
        ];
    });

    let result = data;
    for (let i = 0; i < propertiesMap.length; ++i) {
        result = result.replace(
            new RegExp(` ${propertiesMap[i][0]}.?=.*?\n?.*?;`, "g"),
            ` ${propertiesMap[i][0]} = ${
                Number.isNaN(+propertiesMap[i][1]) ? '"' + propertiesMap[i][1] + '"' : +propertiesMap[i][1]
            };`
        );
    }

    try {
        await fsExtra.writeFile(propertiesFile, result, "utf8");
    } catch (e) {
        // eslint-disable-next-line no-console
        return console.log("Failed to rewrite properties file", e);
    }
}
