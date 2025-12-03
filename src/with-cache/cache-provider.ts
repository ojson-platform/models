import type {CacheProvider} from './cache';
import type {Key, Json} from '../types';

export class MemoryCache implements CacheProvider {
    private memory = new Map<Key, {value: Json; deadline: number}>();

    private timer: NodeJS.Timeout;

    constructor({cleanup = 10000} = {}) {
        this.cleanup(cleanup);
    }

    cleanup(delay: number) {
        clearTimeout(this.timer);

        const checkpoint = Date.now();
        for (const [key, {deadline}] of Object.entries(this.memory)) {
            if (deadline <= checkpoint) {
                this.memory.delete(key as Key);
            }
        }

        this.timer = setTimeout(() => this.cleanup(delay), delay);
        this.timer.unref();
    }

    release() {
        clearTimeout(this.timer);
        this.memory = new Map();
    }

    async get(key: Key) {
        const {value, deadline} = this.memory.get(key) || {};
        if (deadline >= Date.now()) {
            return value;
        }

        return undefined;
    }

    async set(key: Key, value: Json, ttl: number) {
        const deadline = Date.now() + ttl * 1000;
        this.memory.set(key, {value, deadline});
    }
}