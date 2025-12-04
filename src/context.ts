export class Context {
    private _name: string;

    private _parent: Context | undefined;

    private _startTime: number;

    private _endTime: number;

    private _error: unknown;

    get name() {
        return this._name;
    }

    get parent() {
        return this._parent;
    }

    get startTime() {
        return this._startTime;
    }

    get endTime() {
        return this._endTime;
    }

    get liveTime() {
        return (this._endTime || Date.now()) - this._startTime;
    }

    get error() {
        return this._error;
    }

    constructor(name: string, parent?: Context) {
        this._name = name;
        this._parent = parent;
        this._startTime = Date.now();
    }

    create(name: string) {
        return new Context(name, this);
    }

    end() {
        this._endTime = Date.now();
    }

    fail(error?: Error | unknown) {
        this._endTime = Date.now();
        this._error = error;
    }

    async call(name: string, action: Function) {
        const ctx = this.create(name);

        try {
            const result = await action(ctx);
            this.end();
            return result;
        } catch (error) {
            this.fail(error);
            throw error;
        }
    }

    /**
     * Emits an event for observability purposes.
     * 
     * This is a no-op by default and can be overridden by telemetry helpers
     * (e.g., `withTelemetry`) to record events in traces.
     * 
     * Other helpers (e.g., `withCache`) can call this method to log events
     * without knowing if telemetry is enabled.
     * 
     * @param name - Event name (e.g., 'cache.hit', 'cache.miss', 'cache.update')
     * @param attributes - Optional attributes to attach to the event
     * 
     * @example
     * ```typescript
     * ctx.event('cache.hit', { key: 'model-key', ttl: 3600 });
     * ```
     */
    event(name: string, attributes?: Record<string, unknown>): void {
        // No-op by default
    }
}