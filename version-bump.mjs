import { readFileSync, writeFileSync } from "fs";

// Read current version from manifest.json
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
const currentVersion = manifest.version;

// Parse version and bump minor version
const versionParts = currentVersion.split(".");
const major = parseInt(versionParts[0]);
const minor = parseInt(versionParts[1]);
const patch = versionParts[2] ? parseInt(versionParts[2]) : 0;

// Increment minor version
const targetVersion = `${major}.${minor + 1}.${patch}`;

// Update manifest.json with new version
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Update package.json with new version
let packageJson = JSON.parse(readFileSync("package.json", "utf8"));
packageJson.version = targetVersion;
writeFileSync("package.json", JSON.stringify(packageJson, null, "\t"));

// Update versions.json with target version and minAppVersion
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

console.log(`Version bumped from ${currentVersion} to ${targetVersion}`);

