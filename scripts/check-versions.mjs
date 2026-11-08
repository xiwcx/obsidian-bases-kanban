import { verifyVersions } from './release-utils.mjs';

console.log(`Version metadata is consistent: ${verifyVersions(process.cwd())}`);
