import type {Context} from './context';

export type Key = string & {
    __type: 'model-key';
}

export type Primitive = null | number | string;

export type OJson = {
    [prop: string]: Primitive | Primitive[] | OJson;
};

/**
 * JSON is any JSON-serializable value.
 * Can be: object (OJson), array, primitive, or boolean.
 */
export type Json = OJson | Json[] | Primitive | boolean;

type Actor<Props extends OJson = OJson, Result extends Json = Json> =
    (props: Props, context: Context) => Result | Promise<Result> | Generator<Result>;

export type Model<
    Props extends OJson = OJson,
    Result extends Json = Json
> = (Actor<Props, Result> | {action: Actor<Props, Result>}) & {
    displayName: string;
};

