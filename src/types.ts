import type {Context} from './context';

export type Key = string & {
    __type: 'model-key';
}

export type Primitive = null | number | string | boolean;

/**
 * OJson (Object JSON) is a subset of JSON where the top level is always an object.
 * Values can be any JSON-serializable value (Json).
 */
export type OJson = {
    [prop: string]: Json;
};

/**
 * JSON is any JSON-serializable value.
 * Can be: object (OJson), array, or primitive (which includes boolean).
 */
export type Json = OJson | Json[] | Primitive;

type Actor<Props extends OJson = OJson, Result extends Json = Json> =
    (props: Props, context: Context) => Result | Promise<Result> | Generator<Result>;

export type Model<
    Props extends OJson = OJson,
    Result extends Json = Json
> = (Actor<Props, Result> | {action: Actor<Props, Result>}) & {
    displayName: string;
};

