#!/usr/bin/env node
/**
 * Superfunction CLI Wrapper
 *
 * This is a thin wrapper that forwards all commands to @spfn/cli.
 * Exists solely to provide a shorter package name for npx usage:
 *
 *   npx spfn@latest init
 *
 * instead of:
 *
 *   npx @spfn/cli@latest init
 */

import { run } from '@spfn/cli';

run();