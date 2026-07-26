import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectScaffoldMode } from '../mode.js';

const mocks = vi.hoisted(() => ({
    prompts: vi.fn(),
}));

vi.mock('prompts', () => ({ default: mocks.prompts }));

describe('selectScaffoldMode', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
    });

    it('keeps historical --yes automation on bare mode', async () =>
    {
        await expect(selectScaffoldMode({ yes: true })).resolves.toBe('bare');
        expect(mocks.prompts).not.toHaveBeenCalled();
    });

    it('honors an explicit full mode in non-interactive runs', async () =>
    {
        await expect(selectScaffoldMode({ yes: true, mode: 'full' })).resolves.toBe('full');
        expect(mocks.prompts).not.toHaveBeenCalled();
    });

    it('recommends full as the first interactive choice', async () =>
    {
        mocks.prompts.mockResolvedValue({ selectedMode: 'full' });

        await expect(selectScaffoldMode({})).resolves.toBe('full');
        expect(mocks.prompts).toHaveBeenCalledWith(expect.objectContaining({
            initial: 0,
            choices: expect.arrayContaining([
                expect.objectContaining({ value: 'full' }),
                expect.objectContaining({ value: 'bare' }),
            ]),
        }));
    });
});
