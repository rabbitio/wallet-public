#!/usr/bin/env node
/**
 * Rabbit.io – i18n Consistency Validator
 *
 * Checks all translation JSONs under:
 *   • backend/public/locales/<lang>/<namespace>.json
 *   • src/ui/utils/multilanguage/languages/<lang>.json  (treated as namespace "ui")
 *
 * Rules:
 *   1. Key sets identical across languages for each namespace
 *   2. Same key-count per language
 *   3. Identical {{placeholders}} for each key
 *
 * Pretty PASS/FAIL summary à-la unit-tests.
 */

import fs from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import chalk from "chalk";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOCALE_SOURCES = [
    {
        root: path.join(REPO_ROOT, "..", "backend", "public", "locales"),
        pattern: "nested", // <root>/<lang>/<namespace>.json
    },
    {
        root: path.join(REPO_ROOT, "..", "src", "ui", "utils", "multilanguage", "languages"),
        pattern: "flat", // <root>/<lang>.json  (single namespace "ui")
        forcedNamespace: "<single-namespace>",
    },
];

const PLACEHOLDER_RE = /{{\s*([-.\w]+)\s*}}/g;

/**
 * Flattens a nested translation object into dot-notation keys.
 * @example
 *   flatten({ a: { b: 'x' }})  //=> { 'a.b': 'x' }
 */
const flatten = (obj, prefix = "") =>
    Object.entries(obj).reduce((acc, [k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            Object.assign(acc, flatten(v, key));
        } else if (Array.isArray(v)) {
            throw new Error(`Array values are not supported: key "${key}"`);
        } else {
            acc[key] = v;
        }
        return acc;
    }, {});

const readJSON = async path => JSON.parse(await fs.readFile(path, "utf8"));

async function collectLocaleFiles() {
    const entries = [];
    for (const src of LOCALE_SOURCES) {
        if (src.pattern === "nested") {
            const langs = await fs.readdir(src.root);
            for (const lang of langs) {
                const langDir = path.join(src.root, lang);
                if (!(await fs.stat(langDir)).isDirectory()) continue;
                for (const file of await fs.readdir(langDir)) {
                    if (!file.endsWith(".json")) continue;
                    entries.push({
                        lang,
                        namespace: file,
                        path: path.join(langDir, file),
                    });
                }
            }
        } else {
            // flat
            for (const file of await fs.readdir(src.root)) {
                if (!file.endsWith(".json")) continue;
                const lang = file.replace(/\.json$/, "");
                entries.push({
                    lang,
                    namespace: src.forcedNamespace + ".json",
                    path: path.join(src.root, file),
                });
            }
        }
    }
    return entries;
}

function diffSets(reference, other) {
    return {
        missing: [...reference].filter(x => !other.has(x)),
        extra: [...other].filter(x => !reference.has(x)),
    };
}

(async () => {
    const collectedLocaleFiles = await collectLocaleFiles();

    // Group by namespace → { namespace => [{lang,path}, …] }
    const byNamespace = collectedLocaleFiles.reduce((m, e) => {
        (m[e.namespace] ??= []).push(e);
        return m;
    }, {});

    const failures = [];
    let passCount = 0;

    for (const [namespace, files] of Object.entries(byNamespace)) {
        const keyMap = {}; // lang => Set(keys)
        const placeholdersMap = {}; // lang => Map(key => Set(placeholders))
        const parseErrors = [];

        for (const { lang, path: p } of files) {
            try {
                const json = await readJSON(p);
                const flat = flatten(json);
                keyMap[lang] = new Set(Object.keys(flat));
                placeholdersMap[lang] = Object.entries(flat).reduce((m, [k, v]) => {
                    const set = new Set();
                    if (typeof v === "string") for (const [, ph] of v.matchAll(PLACEHOLDER_RE)) set.add(ph);
                    m[k] = set;
                    return m;
                }, {});
            } catch (e) {
                parseErrors.push(`${lang}: ${e.message}`);
            }
        }

        if (parseErrors.length) {
            failures.push(chalk.red(`✗ ${namespace} – could not parse:\n    ${parseErrors.join("\n    ")}`));
            continue;
        }

        // Choose first language as reference
        const refLang = Object.keys(keyMap)[0];
        const refKeys = keyMap[refLang];
        let namespaceHasError = false;

        // same key set
        for (const [lang, keys] of Object.entries(keyMap)) {
            const { missing, extra } = diffSets(refKeys, keys);
            if (missing.length || extra.length) {
                namespaceHasError = true;
                failures.push(
                    chalk.red(`✗ ${namespace} – key mismatch in '${lang}'`) +
                        (missing.length ? `\n    missing: ${missing.join(", ")}` : "") +
                        (extra.length ? `\n    extra:   ${extra.join(", ")}` : "")
                );
            }

            if (keys.size !== refKeys.size) {
                failures.push(
                    chalk.red(
                        `✗ ${namespace} – key-count mismatch in '${lang}' ` +
                        `(expected ${refKeys.size}, got ${keys.size})`
                    ),
                );
                namespaceHasError = true;
            }
        }

        // placeholder consistency per key
        for (const key of refKeys) {
            const refPlaceholder = placeholdersMap[refLang][key] ?? new Set();
            for (const [lang, phPerKey] of Object.entries(placeholdersMap)) {
                const own = phPerKey[key] ?? new Set();
                if (![...refPlaceholder].every(x => own.has(x)) || [...own].some(x => !refPlaceholder.has(x))) {
                    namespaceHasError = true;
                    failures.push(
                        chalk.red(`✗ ${namespace} – placeholder mismatch for '${key}' in '${lang}'`) +
                            `\n    expected {${[...refPlaceholder].join(", ")}}, got {${[...own].join(", ")}}`
                    );
                }
            }
        }

        if (!namespaceHasError) {
            passCount++;
            const langs = Object.keys(keyMap).length;
            const keys = refKeys.size;
            console.log(chalk.green(`✓ ${namespace}  (${langs} langs, ${keys} keys)`));
        }
    }

    // Summary
    console.log();
    console.log(
        failures.length
            ? chalk.red.bold(`FAIL  ${failures.length} problem${failures.length > 1 ? "s" : ""}`)
            : chalk.green.bold(`PASS  all namespaces (${passCount})`)
    );
    if (failures.length) {
        console.log("\n" + failures.join("\n") + "\n");
        process.exit(1);
    }
})();
