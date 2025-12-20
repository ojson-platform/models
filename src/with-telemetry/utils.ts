import type {OJson, Json} from '../types';
import type {PropsFilter} from './types';
import type {Attributes, AttributeValue} from '@opentelemetry/api';

import {trace} from '@opentelemetry/api';

import {isOJson} from '../utils';

/** @internal Model execution info stored in AsyncLocalStorage for parallel/nested calls. */
export interface ModelInfo {
  displayProps?: PropsFilter;
  displayResult?: PropsFilter;
  displayTags?: Attributes;
  props: OJson;
}

/** @internal Checks if value is a valid OpenTelemetry attribute (string/number/boolean/array of these). */
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

/** @internal Extracts a single field from an object based on filter config. */
function extractField(
  acc: Attributes,
  field: string,
  value: boolean | string | ((key: string, value: unknown) => unknown),
  object: OJson,
  prefix: string,
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

/** @internal Extracts fields from an object based on filter config, returns OpenTelemetry Attributes. */
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

/** @internal Extracts fields from result value (any Json type), records primitives/arrays directly. */
export function extractResultFields(value: Json, filter: PropsFilter): Attributes {
  if (!isOJson(value)) {
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

/** @internal Extracts a readable error message from an error object. */
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

/** @internal Extracts stack trace from an error object if available. */
export function extractStacktrace(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as any).stack);
  }
}

/** @internal Verifies that OpenTelemetry SDK is initialized, throws with setup instructions if not. */
export function ensureNodeSDKInitialized(): void {
  try {
    const provider = trace.getTracerProvider();
    if (!provider) {
      throw new Error('Tracer provider is not available');
    }

    const tracer = provider.getTracer('with-telemetry-check');
    if (!tracer) {
      throw new Error('Tracer is not available');
    }
  } catch (error) {
    throw new Error(
      'withTelemetry requires NodeSDK from @opentelemetry/sdk-node to be initialized. ' +
        'Please initialize NodeSDK before using withTelemetry:\n\n' +
        "import {NodeSDK} from '@opentelemetry/sdk-node';\n" +
        "const sdk = new NodeSDK({serviceName: 'your-service'});\n" +
        'sdk.start();\n\n' +
        'See src/with-telemetry/readme.md for details.',
    );
  }
}
