/**
 * @spfn/auth - AWS SNS Integration Tests
 *
 * Real SMS sending tests using actual AWS SNS service
 *
 * ⚠️ WARNING:
 * - These tests send REAL SMS messages
 * - SMS sending incurs AWS charges
 * - Requires valid AWS credentials
 * - Requires real phone number
 *
 * Setup:
 * 1. Copy .env.test.example to .env.test
 * 2. Set your AWS credentials and test phone number
 * 3. Run: ENABLE_SMS_INTEGRATION_TESTS=true pnpm test aws-sns.integration
 *
 * Cost estimate: ~$0.00645 per SMS (varies by region)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAWSSNSProvider } from './aws-sns.provider';

// Only run these tests if explicitly enabled
const shouldRunIntegrationTests = process.env.ENABLE_SMS_INTEGRATION_TESTS === 'true';
const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
const awsRegion = process.env.SPFN_AUTH_AWS_REGION;
const awsAccessKeyId = process.env.SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY;

const describeOrSkip = shouldRunIntegrationTests ? describe : describe.skip;

describeOrSkip('AWS SNS Integration Tests (Real SMS)', () =>
{
    let provider: ReturnType<typeof createAWSSNSProvider>;

    beforeAll(() =>
    {
        // Verify required environment variables
        if (!testPhoneNumber)
        {
            throw new Error(
                'TEST_PHONE_NUMBER environment variable is required. ' +
                'Set it to your phone number in E.164 format (e.g., +821012345678)'
            );
        }

        if (!awsAccessKeyId || !awsSecretAccessKey)
        {
            throw new Error(
                'AWS credentials are required. Set SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID and ' +
                'SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY environment variables.'
            );
        }

        // Create provider
        provider = createAWSSNSProvider();

        if (!provider)
        {
            throw new Error(
                '@aws-sdk/client-sns is not installed. ' +
                'Install it with: pnpm add @aws-sdk/client-sns'
            );
        }

        console.log('\n⚠️  WARNING: These tests will send REAL SMS messages and incur AWS charges\n');
        console.log(`Test phone number: ${testPhoneNumber}`);
        console.log(`AWS Region: ${awsRegion || 'ap-northeast-2 (default)'}\n`);
    });

    it('should send real SMS to test phone number', async () =>
    {
        const testMessage = `[SPFN Auth Test] Your verification code is: ${Math.floor(100000 + Math.random() * 900000)}`;

        console.log(`\n📤 Sending SMS to ${testPhoneNumber}...`);

        const result = await provider!.sendSMS({
            phone: testPhoneNumber!,
            message: testMessage,
            purpose: 'integration-test',
        });

        console.log(`✅ SMS sent successfully!`);
        console.log(`   Message ID: ${result.messageId}`);
        console.log(`   Check your phone for the message\n`);

        expect(result.success).toBe(true);
        expect(result.messageId).toBeDefined();
        expect(result.messageId).toMatch(/^[a-f0-9-]+$/i); // AWS message ID format
    }, 30000); // 30 second timeout for real API call

    it('should handle invalid phone number format', async () =>
    {
        const result = await provider!.sendSMS({
            phone: '01012345678', // Invalid: missing + prefix
            message: 'Test message',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('E.164 format');
    });

    it('should send SMS with custom sender ID if configured', async () =>
    {
        const senderId = process.env.SPFN_AUTH_AWS_SNS_SENDER_ID;

        if (!senderId)
        {
            console.log('\n⏭️  Skipping sender ID test (SPFN_AUTH_AWS_SNS_SENDER_ID not set)\n');
            return;
        }

        const testMessage = `[${senderId}] Test verification code: 123456`;

        console.log(`\n📤 Sending SMS with Sender ID '${senderId}'...`);

        const result = await provider!.sendSMS({
            phone: testPhoneNumber!,
            message: testMessage,
            purpose: 'sender-id-test',
        });

        console.log(`✅ SMS with Sender ID sent successfully!`);
        console.log(`   Message ID: ${result.messageId}`);
        console.log(`   Check if sender ID appears on your phone\n`);

        expect(result.success).toBe(true);
        expect(result.messageId).toBeDefined();
    }, 30000);

    it('should fail with invalid AWS credentials', async () =>
    {
        // Create provider with invalid credentials
        const originalEnv = { ...process.env };

        process.env.SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID = 'INVALID_KEY';
        process.env.SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY = 'INVALID_SECRET';

        const invalidProvider = createAWSSNSProvider();

        // Restore original env
        process.env = originalEnv;

        if (!invalidProvider)
        {
            // Provider creation failed, which is also acceptable
            return;
        }

        const result = await invalidProvider.sendSMS({
            phone: testPhoneNumber!,
            message: 'This should fail',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    }, 30000);
});

// Instructions for running these tests
if (!shouldRunIntegrationTests && process.env.NODE_ENV === 'test')
{
    console.log('\n' + '='.repeat(80));
    console.log('📱 AWS SNS Integration Tests are SKIPPED');
    console.log('='.repeat(80));
    console.log('\nTo run real SMS sending tests:\n');
    console.log('1. Set up your test environment:');
    console.log('   cp .env.test.example .env.test');
    console.log('');
    console.log('2. Edit .env.test with your AWS credentials and phone number');
    console.log('');
    console.log('3. Run tests:');
    console.log('   ENABLE_SMS_INTEGRATION_TESTS=true pnpm test aws-sns.integration');
    console.log('');
    console.log('⚠️  WARNING: Real SMS tests will incur AWS charges!');
    console.log('   Estimated cost: ~$0.00645 per SMS (varies by region)');
    console.log('='.repeat(80) + '\n');
}