import { readFileSync } from 'fs';

// Load a .env file (if present) into process.env. Zero-dependency parser so we don't
// add an npm package on a Node-version-sensitive project. Real shell env vars take
// precedence (we never overwrite an already-set variable), and keys.json still wins
// over both via getKey() below — so .env and keys.json can coexist with no migration.
function loadDotEnv(file = './.env') {
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return; // no .env file is fine
    }
    for (let line of raw.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key) continue;
        let val = line.slice(eq + 1).trim();
        // strip surrounding single or double quotes if present
        if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

loadDotEnv();

let keys = {};
try {
    const data = readFileSync('./keys.json', 'utf8');
    keys = JSON.parse(data);
} catch (err) {
    // keys.json is optional — keys can come from .env / environment variables instead.
}

export function getKey(name) {
    let key = keys[name];
    if (!key) {
        key = process.env[name];
    }
    if (!key) {
        throw new Error(`API key "${name}" not found in keys.json or environment variables!`);
    }
    return key;
}

export function hasKey(name) {
    return keys[name] || process.env[name];
}
