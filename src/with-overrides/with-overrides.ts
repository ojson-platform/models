import type {Model} from '../types';
import type {WithModels} from '../with-models';
import type {BaseContext} from '../context';

/**
 * Map of model overrides.
 *
 * Keys are original models, values are override models that should be used
 * instead when `ctx.request` is called.
 *
 * Overrides can be chained:
 * - `overrides.set(A, B); overrides.set(B, C);` → A and B both resolve to C.
 */
export type Overrides = Map<Model, Model>;

/**
 * Wraps the context's `create` method so that child contexts inherit the same
 * override map and overridden `request` behavior.
 *
 * @param create - Original `create` method from a `WithModels` context
 * @param overrides - Map of model overrides
 * @internal
 */
const wrapCreate = (create: WithModels<BaseContext>['create'], overrides: Overrides) =>
    function(this: WithModels<BaseContext>, name: string) {
        return wrapContext(create.call(this, name), overrides);
    };

/**
 * Wraps the context's `request` method to apply model overrides.
 *
 * When a model has an override, the override chain is resolved to the final
 * model (following the `Overrides` map) before delegating to the original
 * `request`.
 *
 * @param request - Original `request` method from a `WithModels` context
 * @param overrides - Map of model overrides
 * @internal
 */
const wrapRequest = (request: WithModels<BaseContext>['request'], overrides: Overrides) =>
    function(this: WithModels<BaseContext>, model: Model, props: unknown) {
        const overridden = getOverridden(model, overrides);

        return request.call(this, overridden || model, props as any);
    };

/**
 * Wraps a `WithModels` context so that:
 * - `request` respects the provided overrides map
 * - `create` propagates overrides to child contexts
 *
 * @param ctx - Base context with `withModels` capabilities
 * @param overrides - Map of model overrides
 * @returns Enhanced context with override-aware `request`
 * @internal
 */
const wrapContext = <CTX extends WithModels<BaseContext>>(ctx: CTX, overrides: Overrides) => {
    Object.assign(ctx, {
        create: wrapCreate(ctx.create, overrides),
        request: wrapRequest(ctx.request, overrides),
    });

    return ctx;
};

/**
 * Factory function that enhances a `WithModels` context with override support.
 *
 * It allows you to substitute one model with another at runtime (e.g. for
 * testing, A/B testing, feature flags, or local development).
 *
 * Overrides are resolved transitively: if A → B and B → C, then both A and B
 * will delegate to C.
 *
 * @param overrides - Map of model overrides
 * @returns Wrapper function that applies overrides to a `WithModels` context
 *
 * @example
 * ```ts
 * const overrides = new Map<Model, Model>([
 *   [OriginalModel, MockModel],
 * ]);
 *
 * const wrap = compose([
 *   withModels(registry),
 *   withOverrides(overrides),
 * ]);
 *
 * const ctx = wrap(new BaseContext('request'));
 * // All ctx.request(OriginalModel, ...) calls will actually invoke MockModel.
 * ```
 */
export function withOverrides(overrides: Overrides) {
    return function<CTX extends WithModels<BaseContext>>(ctx: CTX) {
        return wrapContext(ctx, overrides);
    };
}

/**
 * Resolves the final override target for a model.
 *
 * Follows the override chain until it reaches a model that is not itself
 * overridden in the map.
 *
 * If there is no override, returns `undefined`.
 *
 * @param model - Original model
 * @param overrides - Map of model overrides
 * @returns Final override model, or `undefined` if none
 * @internal
 */
function getOverridden(model: Model, overrides: Overrides) {
    let overridden = overrides.get(model);

    while (overridden) {
        const next = overrides.get(overridden);

        if (!next) {
            return overridden;
        }

        overridden = next;
    }

    return undefined;
}