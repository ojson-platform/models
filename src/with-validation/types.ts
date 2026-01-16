import type {BaseContext} from '../context';
import type {Json, Model, OJson} from '../types';
import type {WithModels} from '../with-models';

/**
 * Schema describing a JSON object with optional nested properties.
 *
 * This is intentionally a minimal subset of JSON Schema, tailored for
 * validating `OJson` model props before execution.
 */
export type ValidationSchema<Props extends OJson = OJson> = {
  type: 'object';
  required?: Array<Extract<keyof Props, string>>;
  properties?: Record<string, ValidationSchema | PrimitiveSchema>;
  additionalProperties?: boolean;
};

export type PrimitiveSchema = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'null';
  /**
   * Supported string formats (minimal built-in set).
   * - email: RFC-ish basic check
   * - uuid: v1-v5 UUID
   * - date-time: ISO-8601 date-time parseable by Date
   */
  format?: 'email' | 'uuid' | 'date-time';
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: ValidationSchema | PrimitiveSchema;
};

export type Schema = ValidationSchema | PrimitiveSchema;

export type ZodLikeSchema = {
  safeParse(
    value: unknown,
  ):
    | {success: true; data: unknown}
    | {
        success: false;
        error: {issues?: Array<{path?: unknown; message?: unknown; received?: unknown}>};
      };
};

export type AnySchema = Schema | ZodLikeSchema;

export type ValidationIssue = {
  path: string;
  message: string;
  value: unknown;
};

export class ValidationError extends Error {
  constructor(
    public errors: ValidationIssue[],
    message?: string,
  ) {
    super(message || `Validation failed: ${errors.map(e => `${e.path}: ${e.message}`).join(', ')}`);
    this.name = 'ValidationError';
  }
}

export type ValidatorKind = 'json-schema' | 'zod' | 'custom';

export type ValidationConfig = {
  /**
   * When `true` (default), validation failures throw `ValidationError`.
   * When `false`, validation failures only emit a `validation.failed` event
   * (if the context supports `event()`), and execution continues.
   *
   * This keeps `ctx.request()` return types stable.
   */
  strict?: boolean;
  /**
   * Which validator implementation to use.
   *
   * - json-schema: built-in minimal schema validator (default)
   * - zod: duck-typed support for schemas exposing `safeParse`
   * - custom: use `customValidator`
   */
  validator?: ValidatorKind;
  /**
   * Custom validation function. Used when `validator === 'custom'`.
   */
  customValidator?: (value: unknown, schema: AnySchema) => ValidationIssue[];
};

/**
 * Helper type that adds validation configuration properties to any model.
 *
 * Use this to extend your global `Model` type when using `withValidation`:
 *
 * @example
 * ```typescript
 * // globals.d.ts
 * declare global {
 *   import {Model as BaseModel, WithValidationConfig} from '@ojson/models';
 *   type Model = BaseModel & WithValidationConfig;
 * }
 * ```
 */
export type WithValidationConfig = {
  /** Validate model props before execution */
  schemaProps?: AnySchema;
  /** Optional: validate model result after execution */
  schemaResult?: AnySchema;
};

export type ModelWithValidation<Props extends OJson, Result extends Json> = Model<Props, Result> &
  WithValidationConfig;

export type ValidateFn = (model: Model, props: OJson) => ValidationIssue[];

/**
 * Context extended with validation helpers.
 *
 * Note: `ctx.request()` keeps the original return type (throws on validation errors).
 * For non-throwing flows, use `config.strict: false` to emit an event only.
 */
export type WithValidation<T extends WithModels<BaseContext>> = Omit<T, 'create'> & {
  validate: ValidateFn;
  create(...args: Parameters<T['create']>): WithValidation<T>;
} & T;
