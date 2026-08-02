/**
 * Writes the mobile contract bundle and its provenance record.
 *
 *   pnpm --filter @spfn/auth export:mobile-contract
 *
 * Output lands in `contracts/mobile/` at the repository root. Both files are
 * committed; `contract-export.test.ts` fails when what is committed differs
 * from what the assembler produces, so the export cannot drift from the source
 * modules unnoticed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    BUNDLE_FILENAME,
    BUNDLE_REPO_PATH,
    PROVENANCE_FILENAME,
    renderMobileContractExport,
} from '../src/server/client-proof/contract-bundle';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', '..', '..', 'contracts', 'mobile');

const { bundle, provenance, bundleSha256 } = renderMobileContractExport();

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, BUNDLE_FILENAME), bundle, 'utf8');
writeFileSync(join(outputDir, PROVENANCE_FILENAME), provenance, 'utf8');

console.log(`${BUNDLE_REPO_PATH}  sha256=${bundleSha256}`);
