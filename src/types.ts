import type {BaseContext} from './context';

export type Key = string & {
  __type: 'model-key';
};

export type Primitive = null | number | string | boolean;

/**
 * OJson (Object JSON) is a subset of JSON where the top level is always an object.
 * Values can be any JSON-serializable value (Json) or undefined.
 *
 * Undefined values are allowed to support optional properties in model interfaces.
 * The `sign()` function explicitly skips undefined values when creating cache keys,
 * ensuring consistent memoization for models with optional properties.
 */
export type OJson = {
  [prop: string]: Json | undefined;
};

/**
 * JSON is any JSON-serializable value.
 * Can be: object (OJson), array, or primitive (which includes boolean).
 */
export type Json = OJson | Json[] | Primitive;

export type Actor<
  Props extends OJson = OJson,
  Result extends Json = Json,
  Ctx extends BaseContext = BaseContext,
> = (props: Props, context: Ctx) => Result | Promise<Result> | Generator<Result>;

export type Model<
  Props extends OJson = OJson,
  Result extends Json = Json,
  Ctx extends BaseContext = BaseContext,
> = (Actor<Props, Result, Ctx> | {action: Actor<Props, Result, Ctx>}) & {
  displayName: string;
};

/**
 * Helper type to extract Props from a Model.
 * Works with both function models and object models with action property.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction in conditional types
export type ModelProps<M> = M extends (...args: any[]) => any
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
    M extends (props: infer Props, ...args: any[]) => any
    ? Props
    : never
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
    M extends {action: (...args: any[]) => any}
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
      M['action'] extends (props: infer Props, ...args: any[]) => any
      ? Props
      : never
    : never;

/**
 * Helper type to extract Result from a Model.
 * Works with both function models and object models with action property.
 * Extracts the return type, handling Promise and Generator.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction in conditional types
export type ModelResult<M> = M extends (...args: any[]) => infer R
  ? R extends Promise<infer T>
    ? T
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for Generator type parameters
      R extends Generator<infer T, any, any>
      ? T
      : R
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
    M extends {action: (...args: any[]) => infer R}
    ? R extends Promise<infer T>
      ? T
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for Generator type parameters
        R extends Generator<infer T, any, any>
        ? T
        : R
    : never;

/**
 * Helper type to extract Ctx from a Model.
 * Works with both function models and object models with action property.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction in conditional types
export type ModelCtx<M> = M extends (props: any, ctx: infer Ctx, ...args: any[]) => any
  ? Ctx
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
    M extends {action: (props: any, ctx: infer Ctx, ...args: any[]) => any}
    ? Ctx
    : never;
