import type {Attributes, AttributeValue} from '@opentelemetry/api';
import type {OJson, Json} from '../types';
import type {PropsFilter} from './types';

import {isPlainObject} from '../utils';

/**
 * @internal
 * Information about the current model being executed, stored in AsyncLocalStorage
 * to support parallel and nested model calls.
 */
export interface ModelInfo {
  displayProps?: PropsFilter;
  displayResult?: PropsFilter;
  displayTags?: Attributes;
  props: OJson;
}

/**
 * @internal
 * Local check for valid OpenTelemetry attribute values.
 *
 * We intentionally avoid depending on `@opentelemetry/sdk-node` here and instead
 * implement a minimal runtime guard compatible with the AttributeValue type:
 * - string
 * - number
 * - boolean
 * - arrays of the above.
 */
export function isAttributeValue(value: unknown): value is AttributeValue {
  if (value == null) {
    return false;
  }

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(item => {
      const it = typeof item;
      return item != null && (it === 'string' || it === 'number' || it === 'boolean');
    });
  }

  return false;
}

/**
 * @internal
 * Checks if a value is an object (OJson) that can be used with extractFields.
 * Uses isPlainObject to ensure it's a plain object, not a class instance.
 */
function isOJsonObject(value: unknown): value is OJson {
  return isPlainObject(value);
}

/**
 * @internal
 * Extracts a single field from an object based on filter configuration.
 */
function extractField(
  acc: Attributes,
  field: string,
  value: boolean | string | ((key: string, value: unknown) => unknown),
  object: OJson,
  prefix: string
): Attributes {
  let extractedValue: unknown;

  if (value === true) {
    extractedValue = object[field];
  } else if (typeof value === 'string') {
    extractedValue = object[value];
  } else if (typeof value === 'function') {
    extractedValue = value(field, object[field]);
  } else {
    return acc;
  }

  if (isAttributeValue(extractedValue)) {
    acc[prefix + field] = extractedValue;
  }

  return acc;
}

/**
 * @internal
 * Extracts fields from an object based on filter configuration.
 * Returns an Attributes object suitable for OpenTelemetry spans.
 */
export function extractFields(object: OJson, filter: PropsFilter, prefix = ''): Attributes {
  prefix = prefix ? prefix + '.' : prefix;

  if (filter === '*') {
    return Object.keys(object).reduce(
      (acc, key) => extractField(acc, key, true, object, prefix),
      {} as Attributes,
    );
  }

  if (typeof filter === 'object') {
    return Object.keys(filter).reduce(
      (acc, key) => extractField(acc, key, filter[key], object, prefix),
      {} as Attributes,
    );
  }

  return {};
}

/**
 * @internal
 * Safely extracts fields from a result value that can be any Json type.
 * For non-object values (arrays, primitives, booleans), records them directly.
 */
export function extractResultFields(value: Json, filter: PropsFilter): Attributes {
  if (!isOJsonObject(value)) {
    // For non-object values (arrays, primitives, booleans), record the value directly
    if (isAttributeValue(value)) {
      return {value} as Attributes;
    }
    // If value is not a valid attribute value, convert to string
    return {value: String(value)} as Attributes;
  }

  // For objects, use the existing extractFields logic
  return extractFields(value, filter);
}

/**
 * @internal
 * Extracts a readable error message from an error object.
 */
export function extractMessage(error: unknown): string {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }

  return String(error);
}

/**
 * @internal
 * Extracts stack trace from an error object if available.
 */
export function extractStacktrace(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as any).stack);
  }
}


