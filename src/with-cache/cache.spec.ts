import type {WithCacheModel} from './with-cache';

import {describe, expect, it, vi} from 'vitest';

import {Cache} from './cache';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('Cache', () => {
    describe('update()', () => {
        it('should deduplicate parallel updates for the same model and props', async () => {
            const cacheProvider = new TrackingCacheProvider();
            const cache = new Cache({default: {ttl: 3600}}, cacheProvider);

            let callCount = 0;
            const model = vi.fn(() => {
                callCount++;
                return {result: callCount};
            }) as unknown as WithCacheModel;
            model.displayName = 'model';

            // Start multiple parallel updates for the same model and props
            const update1 = cache.update(model, {id: 1}, 3600);
            const update2 = cache.update(model, {id: 1}, 3600);
            const update3 = cache.update(model, {id: 1}, 3600);

            // All promises should resolve
            await Promise.all([update1, update2, update3]);

            // Model should be called only once (not three times)
            expect(model).toBeCalledTimes(1);

            // Cache should be set once
            expect(cacheProvider.set).toHaveBeenCalledTimes(1);

            cacheProvider.release();
        });

        it('should allow parallel updates for different models or props', async () => {
            const cacheProvider = new TrackingCacheProvider();
            const cache = new Cache({default: {ttl: 3600}}, cacheProvider);

            let callCount1 = 0;
            const model1 = vi.fn(() => {
                callCount1++;
                return {result: callCount1};
            }) as unknown as WithCacheModel;
            model1.displayName = 'model1';

            let callCount2 = 0;
            const model2 = vi.fn(() => {
                callCount2++;
                return {result: callCount2};
            }) as unknown as WithCacheModel;
            model2.displayName = 'model2';

            // Start parallel updates for different models and props
            const update1 = cache.update(model1, {id: 1}, 3600);
            const update2 = cache.update(model1, {id: 2}, 3600);
            const update3 = cache.update(model2, {id: 1}, 3600);

            // All promises should resolve
            await Promise.all([update1, update2, update3]);

            // Each model should be called for each unique key
            expect(model1).toBeCalledTimes(2); // Different props: {id: 1} and {id: 2}
            expect(model2).toBeCalledTimes(1); // Different model

            // Cache should be set for each unique key
            expect(cacheProvider.set).toHaveBeenCalledTimes(3);

            cacheProvider.release();
        });

        it('should remove key from updates map even if update fails with error', async () => {
            const cacheProvider = new TrackingCacheProvider();
            const cache = new Cache({default: {ttl: 3600}}, cacheProvider);

            const error = new Error('Model error');
            const model = vi.fn(() => {
                throw error;
            }) as unknown as WithCacheModel;
            model.displayName = 'model';

            // Update should fail with error
            await expect(cache.update(model, {id: 1}, 3600)).rejects.toThrow('Model error');

            // Model was called
            expect(model).toBeCalledTimes(1);

            // Cache was not updated
            expect(cacheProvider.set).not.toHaveBeenCalled();

            // Key should be removed from updates map even after error
            // Verify by attempting another update with same key - should proceed normally
            const model2 = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
            model2.displayName = 'model';

            await cache.update(model2, {id: 1}, 3600);
            expect(cacheProvider.set).toHaveBeenCalledTimes(1);
            expect(model2).toBeCalledTimes(1);

            cacheProvider.release();
        });
    });
});


