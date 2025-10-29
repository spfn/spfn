#!/usr/bin/env node
/**
 * Post-generate script for @spfn/cms migrations
 *
 * Automatically adds "CREATE SCHEMA IF NOT EXISTS spfn_cms"
 * to the generated migration SQL files
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const SCHEMA_NAME = 'spfn_cms';

function addSchemaCreation() {
    try {
        // Find all SQL files in migrations directory
        const files = readdirSync(MIGRATIONS_DIR);
        const sqlFiles = files.filter(f => f.endsWith('.sql'));

        if (sqlFiles.length === 0) {
            console.log('No migration files found');
            return;
        }

        // Process each SQL file
        for (const file of sqlFiles) {
            const filePath = join(MIGRATIONS_DIR, file);
            const content = readFileSync(filePath, 'utf-8');

            // Check if schema creation already exists
            if (content.includes(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME}`)) {
                console.log(`✓ ${file} already has schema creation`);
                continue;
            }

            // Check if this file uses the spfn_cms schema
            if (!content.includes(`"${SCHEMA_NAME}".`)) {
                console.log(`⊘ ${file} doesn't use ${SCHEMA_NAME} schema, skipping`);
                continue;
            }

            // Add schema creation at the beginning
            const schemaCreation = `-- Create schema for CMS package\nCREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};\n--> statement-breakpoint\n`;
            const newContent = schemaCreation + content;

            writeFileSync(filePath, newContent, 'utf-8');
            console.log(`✓ Added schema creation to ${file}`);
        }

        console.log('\n✅ Migration post-processing complete');
    } catch (error) {
        console.error('❌ Error processing migrations:', error);
        process.exit(1);
    }
}

addSchemaCreation();