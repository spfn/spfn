/**
 * Google Search Console API Integration (Prototype)
 *
 * This script demonstrates how to:
 * 1. Authenticate with Google Search Console API
 * 2. Register a site
 * 3. Submit sitemap
 * 4. Check indexing status
 *
 * @see https://developers.google.com/webmaster-tools/v1/api_reference_index
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SITE_URL = process.env.SITE_URL || 'https://superfunction.xyz';
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

// Credentials path (you need to create this)
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Scopes required for Search Console API
const SCOPES = ['https://www.googleapis.com/auth/webmasters'];

/**
 * Load OAuth2 credentials
 */
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Credentials file not found: ${CREDENTIALS_PATH}\n` +
      'Please follow the setup guide in GOOGLE_SETUP.md'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  return credentials;
}

/**
 * Create OAuth2 client
 */
function createOAuth2Client() {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

/**
 * Get or create access token
 */
async function authorize(): Promise<OAuth2Client> {
  const oAuth2Client = createOAuth2Client();

  // Check if we have a token already
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('📋 Authorize this app by visiting this URL:');
  console.log(authUrl);
  console.log('\n⚠️  After authorization, paste the code here:');

  // In production, you'd use readline or prompt
  // For now, this is a placeholder
  throw new Error('Manual authorization required. See console output.');
}

/**
 * Add site to Search Console
 */
async function addSite(auth: OAuth2Client, siteUrl: string) {
  const webmasters = google.webmasters({ version: 'v3', auth });

  try {
    await webmasters.sites.add({
      siteUrl,
    });
    console.log(`✅ Site added: ${siteUrl}`);
  } catch (error: any) {
    if (error.code === 409) {
      console.log(`ℹ️  Site already added: ${siteUrl}`);
    } else {
      throw error;
    }
  }
}

/**
 * Submit sitemap to Search Console
 */
async function submitSitemap(auth: OAuth2Client, siteUrl: string, sitemapUrl: string) {
  const webmasters = google.webmasters({ version: 'v3', auth });

  try {
    await webmasters.sitemaps.submit({
      siteUrl,
      feedpath: sitemapUrl,
    });
    console.log(`✅ Sitemap submitted: ${sitemapUrl}`);
  } catch (error: any) {
    console.error(`❌ Error submitting sitemap:`, error.message);
    throw error;
  }
}

/**
 * List sitemaps for a site
 */
async function listSitemaps(auth: OAuth2Client, siteUrl: string) {
  const webmasters = google.webmasters({ version: 'v3', auth });

  try {
    const response = await webmasters.sitemaps.list({
      siteUrl,
    });

    console.log('\n📋 Sitemaps for', siteUrl);
    if (response.data.sitemap && response.data.sitemap.length > 0) {
      response.data.sitemap.forEach((sitemap) => {
        console.log(`  - ${sitemap.path}`);
        console.log(`    Last submitted: ${sitemap.lastSubmitted}`);
        console.log(`    Pending: ${sitemap.isPending}`);
        console.log(`    Errors: ${sitemap.errors || 0}`);
        console.log(`    Warnings: ${sitemap.warnings || 0}`);
      });
    } else {
      console.log('  No sitemaps found');
    }
  } catch (error: any) {
    console.error(`❌ Error listing sitemaps:`, error.message);
    throw error;
  }
}

/**
 * Get site information
 */
async function getSiteInfo(auth: OAuth2Client, siteUrl: string) {
  const webmasters = google.webmasters({ version: 'v3', auth });

  try {
    const response = await webmasters.sites.get({
      siteUrl,
    });

    console.log('\n📊 Site Information:');
    console.log(`  URL: ${response.data.siteUrl}`);
    console.log(`  Permission Level: ${response.data.permissionLevel}`);
  } catch (error: any) {
    console.error(`❌ Error getting site info:`, error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Google Search Console API Integration\n');

  try {
    // Step 1: Authorize
    console.log('Step 1: Authorizing...');
    const auth = await authorize();

    // Step 2: Add site
    console.log('\nStep 2: Adding site...');
    await addSite(auth, SITE_URL);

    // Step 3: Get site info
    console.log('\nStep 3: Getting site info...');
    await getSiteInfo(auth, SITE_URL);

    // Step 4: Submit sitemap
    console.log('\nStep 4: Submitting sitemap...');
    await submitSitemap(auth, SITE_URL, SITEMAP_URL);

    // Step 5: List sitemaps
    console.log('\nStep 5: Listing sitemaps...');
    await listSitemaps(auth, SITE_URL);

    console.log('\n✅ All operations completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { authorize, addSite, submitSitemap, listSitemaps, getSiteInfo };