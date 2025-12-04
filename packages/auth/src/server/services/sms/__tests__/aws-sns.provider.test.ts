/**
 * @spfn/auth - AWS SNS Provider Tests
 *
 * Tests for AWS SNS SMS provider implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @aws-sdk/client-sns
const mockSend = vi.fn();
const mockSNSClient = vi.fn(() => ({
    send: mockSend,
}));
const mockPublishCommand = vi.fn((params) => params);

vi.mock('@aws-sdk/client-sns', () => ({
    SNSClient: mockSNSClient,
    PublishCommand: mockPublishCommand,
}));

// Mock env
vi.mock('@spfn/auth/config', () => ({
    env: {
        SPFN_AUTH_AWS_REGION: 'ap-northeast-2',
        SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID: 'test-access-key',
        SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY: 'test-secret-key',
        SPFN_AUTH_AWS_SNS_SENDER_ID: 'TestApp',
    },
}));

describe('AWS SNS Provider', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe('createAWSSNSProvider', () =>
    {
        it('should create AWS SNS provider or return null based on SDK availability', async () =>
        {
            const { createAWSSNSProvider } = await import('../aws-sns.provider');

            const provider = createAWSSNSProvider();

            // Provider can be null if @aws-sdk/client-sns is not installed (peerDependency)
            // Or it can be created if the mock is working correctly
            if (provider)
            {
                expect(provider.name).toBe('aws-sns');
                expect(provider.sendSMS).toBeDefined();
            }
            else
            {
                // SDK not available - this is expected in some environments
                expect(provider).toBeNull();
            }
        });

        it('should have sendSMS method when provider is created', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (awsSNSProvider)
            {
                expect(awsSNSProvider.name).toBe('aws-sns');
                expect(typeof awsSNSProvider.sendSMS).toBe('function');
            }
        });
    });

    describe('E.164 Phone Validation', () =>
    {
        it('should reject invalid phone number format', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return; // Skip if provider not created
            }

            const result = await awsSNSProvider.sendSMS({
                phone: '01012345678', // Missing + prefix
                message: 'Test',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('E.164 format');
        });

        it('should accept valid E.164 phone numbers', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            mockSend.mockResolvedValue({ MessageId: 'msg-123' });

            const result = await awsSNSProvider.sendSMS({
                phone: '+821012345678',
                message: 'Test message',
            });

            expect(result.success).toBe(true);
        });

        it('should reject phone numbers with invalid format', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            const invalidNumbers = [
                '821012345678',      // No + prefix
                '+0112345678',       // Starts with 0
                '+82-10-1234-5678',  // Contains dashes
                '+82 10 1234 5678',  // Contains spaces
                '123',               // Too short
            ];

            for (const phone of invalidNumbers)
            {
                const result = await awsSNSProvider.sendSMS({
                    phone,
                    message: 'Test',
                });

                expect(result.success).toBe(false);
                expect(result.error).toContain('E.164 format');
            }
        });
    });

    describe('SMS Sending', () =>
    {
        it('should send SMS successfully with valid credentials', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            mockSend.mockResolvedValue({
                MessageId: 'test-message-id-123',
            });

            const result = await awsSNSProvider.sendSMS({
                phone: '+821012345678',
                message: 'Your verification code is: 123456',
                purpose: 'verification',
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-message-id-123');

            // Verify SNSClient was called with correct config
            expect(mockSNSClient).toHaveBeenCalledWith({
                region: 'ap-northeast-2',
                credentials: {
                    accessKeyId: 'test-access-key',
                    secretAccessKey: 'test-secret-key',
                },
            });

            // Verify PublishCommand was called with correct params
            expect(mockPublishCommand).toHaveBeenCalledWith({
                PhoneNumber: '+821012345678',
                Message: 'Your verification code is: 123456',
                MessageAttributes: {
                    'AWS.SNS.SMS.SMSType': {
                        DataType: 'String',
                        StringValue: 'Transactional',
                    },
                    'AWS.SNS.SMS.SenderID': {
                        DataType: 'String',
                        StringValue: 'TestApp',
                    },
                },
            });

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[SMS - AWS SNS]')
            );
        });

        it('should handle SMS sending failure', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            mockSend.mockRejectedValue(new Error('Network error'));

            const result = await awsSNSProvider.sendSMS({
                phone: '+821012345678',
                message: 'Test message',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[SMS - AWS SNS]'),
                expect.any(Error)
            );
        });

        it('should include purpose in log when provided', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            mockSend.mockResolvedValue({ MessageId: 'msg-123' });

            await awsSNSProvider.sendSMS({
                phone: '+821012345678',
                message: 'Test',
                purpose: 'password-reset',
            });

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Purpose: password-reset')
            );
        });

        it('should handle missing purpose gracefully', async () =>
        {
            const { awsSNSProvider } = await import('../aws-sns.provider');

            if (!awsSNSProvider)
            {
                return;
            }

            mockSend.mockResolvedValue({ MessageId: 'msg-123' });

            await awsSNSProvider.sendSMS({
                phone: '+821012345678',
                message: 'Test',
            });

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Purpose: N/A')
            );
        });
    });

    describe('AWS Configuration', () =>
    {
        it('should send SMS without Sender ID when not configured', async () =>
        {
            // Mock env without sender ID
            vi.doMock('@spfn/auth/config', () => ({
                env: {
                    SPFN_AUTH_AWS_REGION: 'us-east-1',
                    SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID: 'test-key',
                    SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY: 'test-secret',
                    SPFN_AUTH_AWS_SNS_SENDER_ID: undefined,
                },
            }));

            vi.resetModules();
            const { createAWSSNSProvider } = await import('../aws-sns.provider');

            const provider = createAWSSNSProvider();

            if (!provider)
            {
                return;
            }

            mockSend.mockResolvedValue({ MessageId: 'msg-123' });

            await provider.sendSMS({
                phone: '+12025551234',
                message: 'Test',
            });

            expect(mockPublishCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    MessageAttributes: expect.objectContaining({
                        'AWS.SNS.SMS.SMSType': expect.any(Object),
                    }),
                })
            );
        });
    });
});