import type {BaseContext} from '../context';
import type {Model, OJson, Json} from '../types';
import type {WithModels} from '../with-models';
import type {ModelInfo} from './utils';
import type {Attributes, Span} from '@opentelemetry/api';
import type {AsyncLocalStorage} from 'node:async_hooks';

/**
 * Filter configuration for extracting fields from props or results.
 *
 * - `'*'` - Include all fields
 * - Object with field names as keys:
 *   - `true` - Include the field as-is
 *   - `string` - Include field with a different name (mapping)
 *   - `function` - Custom extractor function `(key, value) => attributeValue`
 */
export type PropsFilter =
  | '*'
  | Record<string, boolean | string | ((key: string, value: unknown) => unknown)>;

/**
 * Extended model type that supports telemetry configuration.
 *
 * Models can optionally specify:
 * - `displayProps` - Which props fields to include in span attributes
 * - `displayResult` - Which result fields to include in span events
 * - `displayTags` - Additional static attributes to add to spans
 */
export type ModelWithTelemetry<Props extends OJson, Result extends Json> = Model<Props, Result> & {
  displayProps?: PropsFilter;
  displayResult?: PropsFilter;
  displayTags?: Attributes;
};

/**
 * Helper type that adds telemetry configuration properties to any model.
 *
 * Use this to extend your global `Model` type when using `withTelemetry`:
 *
 * @example
 * ```typescript
 * // globals.d.ts
 * declare global {
 *   import {Model as BaseModel, WithTelemetryConfig} from '@ojson/models';
 *   type Model = BaseModel & WithTelemetryConfig;
 * }
 *
 * // some.model.ts
 * export function GetUser(props: {id: string}): Promise<User> {
 *   // ...
 * }
 * GetUser.displayName = 'GetUser';
 * GetUser.displayProps = '*'; // TypeScript knows this property exists
 * ```
 */
export type WithTelemetryConfig = {
  displayProps?: PropsFilter;
  displayResult?: PropsFilter;
  displayTags?: Attributes;
};

/**
 * Internal symbols used to attach telemetry internals to the context.
 * They are exported for typing purposes but not re-exported from the package root.
 * Marked as `unique symbol` so they can be used as computed property keys in types.
 */
export const __Span__: unique symbol = Symbol('TelSpan');
export const __ModelStorage__: unique symbol = Symbol('TelModelStorage');

/**
 * Context extension type that adds OpenTelemetry tracing capabilities.
 *
 * Extends a `WithModels` context with:
 * - A span for tracking this context's execution
 * - Methods to record model props, results, and errors as span attributes/events
 * - Automatic span lifecycle management (start on context creation, end on `ctx.end()` or `ctx.fail()`)
 *
 * All standard `WithModels` and `Context` methods remain available.
 */
export type WithTelemetry<T extends WithModels<BaseContext>> = T & {
  /**
   * Creates a child context that also has telemetry enabled.
   *
   * This overrides the base `create` signature so that helper typings (e.g. in
   * tests) can rely on `ctx.create()` returning the same telemetry-augmented type.
   */
  create(...args: Parameters<T['create']>): WithTelemetry<T>;

  /** @internal OpenTelemetry span for this context */
  [__Span__]: Span;
  /** @internal AsyncLocalStorage for storing model information during execution */
  [__ModelStorage__]: AsyncLocalStorage<ModelInfo>;
  /**
   * Emits an event that will be recorded in the OpenTelemetry span.
   *
   * This method wraps the base `event()` from `withModels` (which is a no-op)
   * and adds OpenTelemetry span recording. Other helpers (e.g., `withCache`) can
   * call this method to log events without knowing if telemetry is enabled.
   */
  event(name: string, attributes?: Record<string, unknown>): void;
};

/**
 * Configuration for the telemetry helper.
 *
 * @property serviceName - Service name used for tracer identification in OpenTelemetry.
 *   This name appears in traces and helps identify which service generated the span.
 */
export type TelemetryConfig = {
  serviceName: string;
};
