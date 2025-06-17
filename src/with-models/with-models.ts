import type { Key, Model, OJson } from '../types';
import type { Context } from '../context';

import {isGenerator, isPromise, isPlainObject, sign} from '../utils';

const __Registry__ = Symbol('RequestRegistry');

export const Dead = Symbol('Dead');

type Registry = Map<Key, Promise<unknown>>;

export type Request<Props extends OJson = OJson, Result extends OJson = OJson> = {
    (model: Model<Props, Result>, props?: Props): Promise<Result | typeof Dead>;
};

export type WithModels<T extends Context> = T & {
    [__Registry__]: Registry;
    isAlive(): boolean;
    kill(): typeof Dead;
    request: Request;
    resolve<Result extends OJson>(value: Promise<Result>): Promise<Result | typeof Dead>;
    create(...args: Parameters<Context['create']>): WithModels<T>;
};

async function request<Props extends OJson, Result extends OJson>(
    this: WithModels<Context>,
    model: Model<Props, Result>,
    props: Props
) {
    if (!model.displayName) {
        throw new TypeError('Model should define static `displayName` property');
    }

    const {displayName} = model;

    props = props || {} as Props;

    const key = `${displayName};${sign(props)}` as Key;

    if (this[__Registry__].has(key)) {
        return this[__Registry__].get(key);
    }

    const action = typeof model === 'function'
        ? model
        : typeof model.action === 'function'
            ? model.action
            : null;

    if (typeof action !== 'function') {
        throw new TypeError('Unexpected model type for ' + displayName);
    }

    const promise = this.call(displayName, async (ctx: WithModels<Context>) => {
        if (!ctx.isAlive()) {
            return Dead;
        }

        let call = action(props, ctx);
        let value = undefined, error = undefined, done = false;

        if (isPromise<Result>(call)) {
            value = await ctx.resolve(call);
        } else if (isPlainObject(call)) {
            value = call;
        } else if (isGenerator<Result>(call)) {
            const states = [];
            while (!done) {
                if (!ctx.isAlive()) {
                    return Dead;
                }

                ({value, done} = error
                        ? (call as Generator<Result>).throw(error)
                        : (call as Generator<Result>).next(value)
                );

                if (done && states.length) {
                    [call, done] = [states.pop(), false];
                }

                if (isGenerator<Result>(value)) {
                    !done && states.push(call);
                    [call, value, done] = [value, undefined, false];
                } else if (isPromise<Result>(value)) {
                    try {
                        value = await ctx.resolve(value);
                    } catch (e) {
                        error = e;
                    }
                }
            }
        } else {
            throw new TypeError('Unexpected model result');
        }

        return value;
    });

    this[__Registry__].set(key, promise);
    promise.catch(() => this[__Registry__].delete(key));

    return promise;
}

const wrapCreate = <CTX extends Context>(create: CTX['create']) =>
    function (name: string) {
        return wrapContext(create.call(this, name));
    };

const wrapContext = <CTX extends Context>(ctx: CTX, registry?: Registry) => {
    let state = null;

    const parent = (ctx.parent || {
        [__Registry__]: registry || new Map(),
        isAlive: () => state !== Dead,
        kill: () => state = Dead,
        request: request,
        resolve: (value) => Promise.resolve(value),
    }) as WithModels<CTX>;

    Object.assign(ctx, {
        [__Registry__]: parent[__Registry__],
        isAlive: parent.isAlive,
        kill: parent.kill,
        request: parent.request,
        resolve: parent.resolve,
        create: wrapCreate(ctx.create),
    });

    return ctx as WithModels<CTX>;
};

export function withModels(registry: Registry) {
    return function<CTX extends Context>(ctx: CTX) {
        return wrapContext(ctx, registry);
    };
}