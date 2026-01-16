import type {OJson} from '../types';
import type {AnySchema, Schema, ValidationIssue, Validator, ZodLikeSchema} from './types';

import {createRequire} from 'node:module';

import {cleanUndefined, isPlainObject} from '../utils';

type CompiledValidator = (value: unknown) => ValidationIssue[];

const compiledJsonSchema = new WeakMap<object, CompiledValidator>();
const compiledAjvSchema = new WeakMap<object, CompiledValidator>();

type AjvLike = {
  compile(schema: unknown): (data: unknown) => boolean;
  errors?: unknown;
};

const require = createRequire(import.meta.url);

type AjvErrorLike = {
  instancePath?: unknown;
  dataPath?: unknown;
  message?: unknown;
  params?: {missingProperty?: unknown};
};

type AjvValidateFn = ((data: unknown) => boolean) & {errors?: unknown};

function tryGetAjv(): {ajv: AjvLike | null} {
  try {
    const AjvMod = require('ajv');
    const AjvCtor = AjvMod?.default ?? AjvMod;
    const ajv = new AjvCtor({
      allErrors: true,
      strict: false,
      validateFormats: true,
    }) as AjvLike;

    try {
      const addFormatsMod = require('ajv-formats');
      const addFormats = addFormatsMod?.default ?? addFormatsMod;
      if (typeof addFormats === 'function') {
        (addFormats as (a: AjvLike) => void)(ajv);
      }
    } catch {
      // ajv-formats is optional
    }

    return {ajv};
  } catch {
    return {ajv: null};
  }
}

const {ajv: AjvInstance} = tryGetAjv();

function issue(path: string, message: string, value: unknown): ValidationIssue {
  return {path, message, value};
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string): boolean {
  // Minimal practical email check (not full RFC 5322).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDateTime(value: string): boolean {
  // Accept ISO-like values parseable by Date.
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function compileNode(schema: Schema, path: string): (value: unknown) => ValidationIssue[] {
  if (schema.type === 'object') {
    const required = new Set(schema.required ?? []);
    const additional = schema.additionalProperties ?? true;
    const properties = schema.properties ?? {};

    const compiledProps: Record<string, (v: unknown) => ValidationIssue[]> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      compiledProps[key] = compileNode(propSchema as Schema, `${path}.${key}`);
    }

    return (value: unknown) => {
      const errors: ValidationIssue[] = [];
      if (!isPlainObject<Record<string, unknown>>(value)) {
        errors.push(issue(path, 'Expected object', value));
        return errors;
      }

      for (const req of required) {
        if (!(req in value)) {
          errors.push(issue(`${path}.${req}`, 'Required property is missing', undefined));
        }
      }

      if (!additional) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) {
            errors.push(
              issue(`${path}.${key}`, 'Additional properties are not allowed', value[key]),
            );
          }
        }
      }

      for (const [key, validate] of Object.entries(compiledProps)) {
        if (!(key in value)) {
          continue;
        }
        errors.push(...validate((value as Record<string, unknown>)[key]));
      }

      return errors;
    };
  }

  if (schema.type === 'array') {
    const itemSchema = schema.items;
    const validateItem = itemSchema ? compileNode(itemSchema as Schema, `${path}[]`) : null;

    return (value: unknown) => {
      const errors: ValidationIssue[] = [];
      if (!Array.isArray(value)) {
        errors.push(issue(path, 'Expected array', value));
        return errors;
      }

      if (validateItem) {
        for (let i = 0; i < value.length; i++) {
          const itemErrors = validateItem(value[i]);
          // Remap path[] placeholder to concrete index
          for (const e of itemErrors) {
            errors.push({
              ...e,
              path: e.path.replace(`${path}[]`, `${path}[${i}]`),
            });
          }
        }
      }

      return errors;
    };
  }

  if (schema.type === 'null') {
    return (value: unknown) => {
      return value === null ? [] : [issue(path, 'Expected null', value)];
    };
  }

  if (schema.type === 'boolean') {
    return (value: unknown) => {
      return typeof value === 'boolean' ? [] : [issue(path, 'Expected boolean', value)];
    };
  }

  if (schema.type === 'number') {
    const min = schema.minimum;
    const max = schema.maximum;

    return (value: unknown) => {
      const errors: ValidationIssue[] = [];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(issue(path, 'Expected number', value));
        return errors;
      }
      if (min !== undefined && value < min) {
        errors.push(issue(path, `Must be >= ${min}`, value));
      }
      if (max !== undefined && value > max) {
        errors.push(issue(path, `Must be <= ${max}`, value));
      }
      return errors;
    };
  }

  // string
  const minL = schema.minLength;
  const maxL = schema.maxLength;
  const format = schema.format;

  return (value: unknown) => {
    const errors: ValidationIssue[] = [];
    if (typeof value !== 'string') {
      errors.push(issue(path, 'Expected string', value));
      return errors;
    }
    if (minL !== undefined && value.length < minL) {
      errors.push(issue(path, `Must have length >= ${minL}`, value));
    }
    if (maxL !== undefined && value.length > maxL) {
      errors.push(issue(path, `Must have length <= ${maxL}`, value));
    }
    if (format === 'email' && !isEmail(value)) {
      errors.push(issue(path, 'Invalid email', value));
    }
    if (format === 'uuid' && !isUuid(value)) {
      errors.push(issue(path, 'Invalid uuid', value));
    }
    if (format === 'date-time' && !isDateTime(value)) {
      errors.push(issue(path, 'Invalid date-time', value));
    }
    return errors;
  };
}

export function compileJsonSchema(schema: Schema): CompiledValidator {
  if (typeof schema !== 'object' || schema === null) {
    // Should not happen for our schema types.
    return () => [issue('$', 'Invalid schema', schema)];
  }

  if (AjvInstance) {
    const cachedAjv = compiledAjvSchema.get(schema);
    if (cachedAjv) {
      return cachedAjv;
    }

    const validate = AjvInstance.compile(schema) as AjvValidateFn;
    const compiled: CompiledValidator = (value: unknown) => {
      const ok = validate(value);
      if (ok) {
        return [];
      }
      const errors = validate.errors ?? AjvInstance.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return errors.map((e): ValidationIssue => {
          const err = (e ?? {}) as AjvErrorLike;
          const rawPath = err.instancePath ?? err.dataPath ?? '';
          const instancePath = String(rawPath || '');
          const missing = err.params?.missingProperty;
          const suffix = instancePath
            ? instancePath.startsWith('/')
              ? instancePath.replace(/^\//, '').split('/').join('.')
              : instancePath.startsWith('.')
                ? instancePath.replace(/^\./, '')
                : instancePath
            : missing
              ? String(missing)
              : '';
          const path = suffix ? `$.${suffix}` : '$';
          return issue(path, String(err.message || 'Invalid value'), value);
        });
      }
      return [issue('$', 'Invalid value', value)];
    };

    compiledAjvSchema.set(schema, compiled);
    return compiled;
  }

  const cached = compiledJsonSchema.get(schema);
  if (cached) {
    return cached;
  }

  const root = compileNode(schema, '$');
  const compiled: CompiledValidator = (value: unknown) => root(value);
  compiledJsonSchema.set(schema, compiled);
  return compiled;
}

function validateZodLike(schema: ZodLikeSchema, value: unknown): ValidationIssue[] {
  if (typeof schema?.safeParse !== 'function') {
    return [issue('$', 'Zod schema with safeParse() is required for validator=zod', schema)];
  }

  const result = schema.safeParse(value);
  if (result.success) {
    return [];
  }

  type ZodSafeParseFailure = {
    success: false;
    error?: {issues?: Array<{path?: unknown; message?: unknown; received?: unknown}>};
  };
  const failure = result as ZodSafeParseFailure;
  const issues = failure.error?.issues;
  if (Array.isArray(issues)) {
    return issues.map(i => {
      const path =
        Array.isArray(i.path) && i.path.length > 0
          ? `$.${i.path.map(p => String(p)).join('.')}`
          : '$';
      return issue(path, String(i.message || 'Invalid value'), i.received);
    });
  }

  return [issue('$', 'Zod validation failed', value)];
}

export function validateValueWithValidator(
  validator: Validator,
  value: unknown,
  schema: AnySchema,
): ValidationIssue[] {
  if (typeof validator === 'function') {
    return validator(value, schema);
  }

  if (validator === 'zod') {
    return validateZodLike(schema as ZodLikeSchema, value);
  }

  // json-schema
  return compileJsonSchema(schema as Schema)(value);
}

export function validatePropsWithValidator(
  validator: Validator,
  props: OJson,
  schema: AnySchema,
): ValidationIssue[] {
  const cleaned = cleanUndefined(props);
  return validateValueWithValidator(validator, cleaned, schema);
}
