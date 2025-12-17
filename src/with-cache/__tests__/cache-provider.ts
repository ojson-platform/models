import type {Key, Json} from '../../types';
import type {CacheProvider} from '../types';

import {vi} from 'vitest';

import {MemoryCache} from '../cache-provider';

/**
 * Mock cache provider that tracks TTL values for testing.
 * Uses vi.fn() for tracking method calls.
 */
export class TrackingCacheProvider implements CacheProvider {
    private provider: MemoryCache;
    public get: CacheProvider['get'];
    public set: CacheProvider['set'];

    displayName = 'TrackingCacheProvider';

    constructor() {
        this.provider = new MemoryCache();
        
        // Wrap methods with vi.fn() to track calls while maintaining functionality
        this.get = vi.fn((key: Key) => this.provider.get(key));
        this.set = vi.fn((key: Key, value: Json, ttl: number) => {
            return this.provider.set(key, value, ttl);
        });
    }

    release() {
        (this.get as ReturnType<typeof vi.fn>).mockClear();
        (this.set as ReturnType<typeof vi.fn>).mockClear();
        this.provider.release();
    }
}
