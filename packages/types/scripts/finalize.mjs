import { writeFileSync } from 'node:fs';

/**
 * The package has no top-level "type" field, so Node treats every .js file as
 * CommonJS. That is correct for dist/cjs, but dist/esm must be marked or Node
 * would try to require() ESM and fail. One marker file per output folder is
 * the standard way to ship both formats from a single package.
 */
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
