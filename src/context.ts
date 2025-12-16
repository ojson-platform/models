
/**
 * Minimal base context interface that defines the required lifecycle API.
 * 
 * Helpers should depend on this interface rather than the concrete `Context` class
 * to allow applications to provide their own context implementations.
 */
export interface BaseContext {
    readonly name: string;
    readonly parent: BaseContext | undefined;
    create(name: string): BaseContext;
    end(): void;
    fail(error?: Error | unknown): void;
    call(name: string, action: Function): Promise<unknown>;
}

export class Context implements BaseContext {
    private _name: string;

    private _parent: BaseContext | undefined;

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

    constructor(name: string, parent?: BaseContext) {
        this._name = name;
        this._parent = parent;
        this._startTime = Date.now();
    }

    create(name: string): BaseContext {
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
            ctx.end();
            return result;
        } catch (error) {
            ctx.fail(error);
            throw error;
        }
    }
}