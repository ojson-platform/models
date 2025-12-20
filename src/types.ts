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
export type ModelProps<M> = M extends (...args: any[]) => any
  ? M extends (props: infer Props, ...args: any[]) => any
    ? Props
    : never
  : M extends {action: (...args: any[]) => any}
    ? M['action'] extends (props: infer Props, ...args: any[]) => any
      ? Props
      : never
    : never;

/**
 * Helper type to extract Result from a Model.
 * Works with both function models and object models with action property.
 * Extracts the return type, handling Promise and Generator.
 */
export type ModelResult<M> = M extends (...args: any[]) => infer R
  ? R extends Promise<infer T>
    ? T
    : R extends Generator<infer T, any, any>
      ? T
      : R
  : M extends {action: (...args: any[]) => infer R}
    ? R extends Promise<infer T>
      ? T
      : R extends Generator<infer T, any, any>
        ? T
        : R
    : never;

/**
 * Helper type to extract Ctx from a Model.
 * Works with both function models and object models with action property.
 */
export type ModelCtx<M> = M extends (props: any, ctx: infer Ctx, ...args: any[]) => any
  ? Ctx
  : M extends {action: (props: any, ctx: infer Ctx, ...args: any[]) => any}
    ? Ctx
    : never;
