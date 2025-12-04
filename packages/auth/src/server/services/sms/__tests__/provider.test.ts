/**
 * @spfn/auth - SMS Provider Tests
 *
 * Tests for SMS provider registration and management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SMSProvider } from '../types';

describe('SMS Provider Management', () =>
{
    // Mock console.log to avoid cluttering test output
    beforeEach(() =>
    {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    describe('registerSMSProvider', () =>
    {
        it('should register a custom SMS provider', async () =>
        {
            // Import fresh module to avoid state pollution
            const { registerSMSProvider, getSMSProvider } = await import('../provider');

            const mockProvider: SMSProvider = {
                name: 'test-provider',
                sendSMS: vi.fn().mockResolvedValue({
                    success: true,
                    messageId: 'test-message-id',
                }),
            };

            registerSMSProvider(mockProvider);

            const provider = getSMSProvider();
            expect(provider.name).toBe('test-provider');
        });
    });

    describe('getSMSProvider', () =>
    {
        it('should return fallback provider when no provider is registered', async () =>
        {
            // Create isolated module instance
            vi.resetModules();
            const { getSMSProvider } = await import('../provider');

            const provider = getSMSProvider();
            expect(provider.name).toBe('fallback');
        });

        it('should return registered provider when available', async () =>
        {
            vi.resetModules();
            const { registerSMSProvider, getSMSProvider } = await import('../provider');

            const mockProvider: SMSProvider = {
                name: 'custom-provider',
                sendSMS: vi.fn().mockResolvedValue({ success: true }),
            };

            registerSMSProvider(mockProvider);

            const provider = getSMSProvider();
            expect(provider.name).toBe('custom-provider');
        });
    });

    describe('sendSMS', () =>
    {
        it('should send SMS using registered provider', async () =>
        {
            vi.resetModules();
            const { registerSMSProvider, sendSMS } = await import('../provider');

            const mockSendSMS = vi.fn().mockResolvedValue({
                success: true,
                messageId: 'msg-123',
            });

            const mockProvider: SMSProvider = {
                name: 'test-provider',
                sendSMS: mockSendSMS,
            };

            registerSMSProvider(mockProvider);

            const result = await sendSMS({
                phone: '+821012345678',
                message: 'Test message',
                purpose: 'test',
            });

            expect(mockSendSMS).toHaveBeenCalledWith({
                phone: '+821012345678',
                message: 'Test message',
                purpose: 'test',
            });

            expect(result).toEqual({
                success: true,
                messageId: 'msg-123',
            });
        });

        it('should use fallback provider when no provider is registered', async () =>
        {
            vi.resetModules();
            const { sendSMS } = await import('../provider');

            const result = await sendSMS({
                phone: '+821012345678',
                message: 'Test message',
            });

            expect(result).toEqual({
                success: true,
                messageId: 'dev-mode-no-actual-sms',
            });

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[SMS - DEV MODE]')
            );
        });
    });

    describe('Fallback Provider', () =>
    {
        it('should log to console in development mode', async () =>
        {
            vi.resetModules();
            const { sendSMS } = await import('../provider');

            await sendSMS({
                phone: '+821012345678',
                message: 'Your code is: 123456',
                purpose: 'verification',
            });

            expect(console.log).toHaveBeenCalledWith(
                '[SMS - DEV MODE] To: +821012345678, Message: Your code is: 123456, Purpose: verification'
            );
        });

        it('should handle missing purpose parameter', async () =>
        {
            vi.resetModules();
            const { sendSMS } = await import('../provider');

            await sendSMS({
                phone: '+821012345678',
                message: 'Test message',
            });

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Purpose: N/A')
            );
        });
    });

    describe('Provider Replacement', () =>
    {
        it('should allow replacing existing provider', async () =>
        {
            vi.resetModules();
            const { registerSMSProvider, getSMSProvider } = await import('../provider');

            const provider1: SMSProvider = {
                name: 'provider-1',
                sendSMS: vi.fn().mockResolvedValue({ success: true }),
            };

            const provider2: SMSProvider = {
                name: 'provider-2',
                sendSMS: vi.fn().mockResolvedValue({ success: true }),
            };

            registerSMSProvider(provider1);
            expect(getSMSProvider().name).toBe('provider-1');

            registerSMSProvider(provider2);
            expect(getSMSProvider().name).toBe('provider-2');
        });
    });
});