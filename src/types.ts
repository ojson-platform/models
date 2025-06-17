import type {Context} from './context';

export type Key = string & {
    __type: 'model-key';
}

export type Primitive = null | number | string;

export type OJson = {
    [prop: string]: Primitive | Primitive[] | OJson;
};

type Actor<Props extends OJson = OJson, Result extends OJson = OJson> =
    (props: Props, context: Context) => Result | Promise<Result> | Generator<Result>;

export type Model<
    Props extends OJson = OJson,
    Result extends OJson = OJson
> = (Actor<Props, Result> | {action: Actor<Props, Result>}) & {
    displayName: string;
};

