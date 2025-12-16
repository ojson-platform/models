import type {Model, ModelResult} from './types';

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

    /**
     * Sets a pre-computed value for a model.
     * 
     * This is used for request-dependent models that should not be computed directly
     * but instead have their values set explicitly (e.g., from Express request data).
     * 
     * Uses the same registry as `request()` for consistency. Builds cache keys
     * using displayName and serialized props (same as `request()`). Throws an error
     * if a value already exists in the registry for the given model+props.
     * 
     * Models that use this pattern should throw an error if called directly:
     * ```typescript
     * function RequestParams() {
     *   throw new Error('This model should be set via ctx.set()');
     * }
     * ```
     * 
     * @param model - The model to set a value for
     * @param value - The pre-computed value for the model
     * @param props - Optional props for the model (defaults to empty object)
     * 
     * @example
     * ```typescript
     * ctx.set(RequestParams, {
     *   params: {...req.params},
     *   query: {...req.query},
     *   body: req.body,
     * });
     * ```
     */
    set(_model: Model<any, any, any>, _value: any, _props?: any): void {
        // No-op by default, implemented by withModels
    }
}