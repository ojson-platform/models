import type {BaseContext} from '../context';
import type {OJson, Model, ModelProps, ModelResult} from '../types';
import type {WithModels} from '../with-models';
import type {
  AnySchema,
  ValidationConfig,
  ValidationIssue,
  WithValidation,
  ValidatorKind,
} from './types';

import {cleanUndefined} from '../utils';

import {ValidationError} from './types';
import {validatePropsWithValidator, validateValueWithValidator} from './utils';

const __ValidationConfig__ = Symbol('ValidationConfig');

type InternalConfig = {
  strict: boolean;
  validator: ValidatorKind;
  customValidator?: (value: unknown, schema: AnySchema) => ValidationIssue[];
};

type ModelMeta = {
  schemaProps?: AnySchema;
  schemaResult?: AnySchema;
  displayName?: unknown;
};

function getSchema(model: Model): AnySchema | undefined {
  // Models are functions or plain objects; both may carry static fields.
  return (model as ModelMeta).schemaProps;
}

function getResultSchema(model: Model): AnySchema | undefined {
  return (model as ModelMeta).schemaResult;
}

function getModelDisplayName(model: Model): string | undefined {
  const name = (model as ModelMeta).displayName;
  return typeof name === 'string' ? name : undefined;
}

function validateModelProps(
  config: InternalConfig,
  model: Model,
  props: unknown,
): ValidationIssue[] {
  const schema = getSchema(model);
  if (!schema) {
    return [];
  }
  const cleanedProps = cleanUndefined((props ?? {}) as OJson);
  return validatePropsWithValidator(config.validator, cleanedProps, schema, config.customValidator);
}

function validateModelResult(
  config: InternalConfig,
  model: Model,
  result: unknown,
): ValidationIssue[] {
  const schemaResult = getResultSchema(model);
  if (!schemaResult) {
    return [];
  }
  return validateValueWithValidator(config.validator, result, schemaResult, config.customValidator);
}

function wrapRequest(request: WithModels<BaseContext>['request'], config: InternalConfig) {
  return async function <M extends Model>(
    this: WithValidation<WithModels<BaseContext>>,
    model: M,
    props?: ModelProps<M>,
  ): Promise<ModelResult<M>> {
    const errors = validateModelProps(config, model, props);
    if (errors.length > 0) {
      this.event?.('validation.failed', {
        model: getModelDisplayName(model),
        count: errors.length,
      });
      if (config.strict) {
        throw new ValidationError(errors);
      }
    }

    const result = (await request.call(this, model, props)) as ModelResult<M>;

    const resultIssues = validateModelResult(config, model, result);
    if (resultIssues.length > 0) {
      this.event?.('validation.result_failed', {
        model: getModelDisplayName(model),
        count: resultIssues.length,
      });
      if (config.strict) {
        // Throw on invalid results so callers never observe invalid data.
        throw new ValidationError(resultIssues, 'Result validation failed');
      }
    }

    return result;
  };
}

function wrapCreate(create: WithModels<BaseContext>['create'], config: InternalConfig) {
  return function (this: WithValidation<WithModels<BaseContext>>, name: string) {
    return wrapContext(create.call(this, name), config);
  };
}

function wrapContext(ctx: WithModels<BaseContext>, config: InternalConfig) {
  Object.assign(ctx, {
    [__ValidationConfig__]: config,
    validate(model: Model, props: OJson) {
      const schema = getSchema(model);
      if (!schema) {
        return [] as ValidationIssue[];
      }
      return validatePropsWithValidator(config.validator, props, schema, config.customValidator);
    },
    request: wrapRequest(ctx.request, config),
    create: wrapCreate(ctx.create, config),
  });

  return ctx as WithValidation<typeof ctx>;
}

export function withValidation(config?: ValidationConfig) {
  const internal: InternalConfig = {
    strict: config?.strict ?? true,
    validator: (config?.validator ?? 'json-schema') as ValidatorKind,
    customValidator: config?.customValidator,
  };

  return function (ctx: WithModels<BaseContext>) {
    return wrapContext(ctx, internal);
  };
}
