import type { Model, OJson } from '../types';
import type { Context } from '../context';

import {URLSearchParams} from 'url';

type Wrapper<CTX extends Context = Context> = (ctx: Context) => CTX;

type Composed<W extends Wrapper[], CTX extends Context> = ReturnType<W[number]> & CTX;

export function compose<W extends Wrapper[]>(wrappers: W) {
    return function<CTX extends Context>(ctx: CTX) {
        for (const wrapper of wrappers) {
            ctx = wrapper(ctx) as CTX;
        }

        return ctx as Composed<W, CTX>;
    };
}

export function wait<T = unknown>(delay: number, value?: T): [Promise<T>, Function] {
    let timer;
    const promise = new Promise<T>((resolve) => {
        timer = setTimeout(resolve, delay, value);
        timer.unref();
    });

    return [promise, () => clearTimeout(timer)];
}

export function sign(props: OJson, set?: Set<unknown>) {
    const acc = new URLSearchParams();

    set = set || new Set();

    Object.keys(props)
        .sort()
        .forEach((key) => {
            const value = props[key];

            if (value && typeof value === 'object') {
                if (set.has(value)) {
                    // skip circular
                    return;
                }

                set.add(value);
                acc.append(key, sign(value as OJson, set));
            } else {
                acc.append(key, String(props[key]));
            }
        });

    return acc.toString();
}

export const isModelUncacheable = (model) => model.length > 2;

export const displayName = (model: Model) => model.displayName;

export const isGenerator = <Result>(target: any): target is Generator<Result> => String(target) === '[object Generator]';

export const isPromise = <Result>(target: any): target is Promise<Result> => String(target) === '[object Promise]';

export const isPlainObject = <Result>(target: any): target is Result => String(target) === '[object Object]';