import type {Model} from '../types';
import type {WithModels} from '../with-models';
import type {Context} from '../context';

export type Overrides = Map<Model, Model>;

const wrapCreate = (create: WithModels<Context>['create'], overrides: Overrides) =>
    function(this: WithModels<Context>, name: string) {
        return wrapContext(create.call(this, name), overrides);
    };

const wrapRequest = (request, overrides) =>
    function (model, props) {
        const overridden = getOverriden(model, overrides);

        // if (overridden) {
        //     this.log(`Use override ${model.displayName} -> ${overridden.displayName}`);
        // }

        return request.call(this, overridden || model, props);
    };

const wrapContext = <CTX extends WithModels<Context>>(ctx: CTX, overrides: Overrides) => {
    Object.assign(ctx, {
        create: wrapCreate(ctx.create, overrides),
        request: wrapRequest(ctx.request, overrides),
    });

    return ctx;
};

export function withOverrides(overrides: Overrides) {
    return function<CTX extends WithModels<Context>>(ctx: CTX) {
        return wrapContext(ctx, overrides);
    };
}

function getOverriden(model: Model, overrides: Overrides) {
    let overriden = overrides.get(model);
    while (overriden) {
        if (!overrides.get(overriden)) {
            return overriden;
        }

        overriden = overrides.get(overriden);
    }
}