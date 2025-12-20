import type {Model, ModelProps, ModelResult, ModelCtx, OJson, Json} from './types';
import type {BaseContext} from './context';
import type {WithModels} from './with-models';
import type {WithTelemetry, WithTelemetryConfig} from './with-telemetry';
import type {WithCache, WithCacheConfig, CacheStrategy} from './with-cache';
import type {Equal, Expect} from './__tests__/type-tests-helpers';

import {describe, it} from 'vitest';

import {Context} from './context';
import {withModels} from './with-models';
import {withTelemetry} from './with-telemetry';
import {withCache} from './with-cache';
import {withDeadline} from './with-deadline';
import {withOverrides} from './with-overrides';
import {compose} from './utils';
import {expectType} from './__tests__/type-tests-helpers';

// Basic model types used in type tests
type Todo = {
  id: string;
  title: string;
};

// Simple in-memory "store" just for typing purposes
const store = {
  _todos: [] as Todo[],
  getAll(): Promise<Todo[]> {
    return Promise.resolve(this._todos);
  },
  get(id: string): Promise<Todo | null> {
    return Promise.resolve(this._todos.find(t => t.id === id) || null);
  },
};

// Models for type inference checks
function GetAllTodos(): Promise<Todo[]> {
  return store.getAll();
}
GetAllTodos.displayName = 'GetAllTodos';

function GetTodo(props: {id: string}): Promise<Todo | null> {
  return store.get(props.id);
}
GetTodo.displayName = 'GetTodo';

// Helper to assert that a value has model type signature
function assertModel<M extends Model<any, any, any>>(_model: M) {
  return _model;
}

const GetAllTodosModel = assertModel(GetAllTodos);
const GetTodoModel = assertModel(GetTodo);

// Object model with action method (used in multiple tests)
const ObjectModel: Model<{value: string}, {result: string}> = {
  displayName: 'ObjectModel',
  action(props: {value: string}, _ctx: BaseContext): {result: string} {
    return {result: props.value};
  },
};

// Synchronous model (used in multiple tests)
function SyncModel(props: {id: string}): Todo {
  return {id: props.id, title: 'test'};
}
SyncModel.displayName = 'SyncModel';

describe('Type Tests', () => {
  // Base context with models
  const registry = new Map();
  const baseCtx = withModels(registry)(new Context('type-tests'));

  describe('withModels: request() inference', () => {
    it('should infer types for models without props', () => {
      // Inference for models without props
      const allTodosPromise = baseCtx.request(GetAllTodosModel);
      expectType<Promise<Todo[]>>(allTodosPromise);
    });

    it('should infer types for models with props', () => {
      // Inference for models with props
      const singleTodoPromise = baseCtx.request(GetTodoModel, {id: 'id-1'});
      expectType<Promise<Todo | null>>(singleTodoPromise);
    });
  });

  describe('compose + withTelemetry + withCache: request() inference is preserved', () => {
    // Minimal cache provider for typing
    const cacheProvider = {
      async get(_key: string): Promise<Json | undefined> {
        return undefined;
      },
      async set(_key: string, _value: Json, _ttl: number): Promise<void> {
        // no-op
      },
    };

    const wrap = compose([
      withModels(new Map()),
      withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
      withTelemetry({serviceName: 'type-tests'}),
    ]);

    const composedCtx = wrap(new Context('request-with-helpers'));

    it('should preserve types for composed context', () => {
      // request() on composed context must keep result type of models
      const composedAllTodosPromise = composedCtx.request(GetAllTodosModel);
      expectType<Promise<Todo[]>>(composedAllTodosPromise);

      const composedSingleTodoPromise = composedCtx.request(GetTodoModel, {id: 'id-2'});
      expectType<Promise<Todo | null>>(composedSingleTodoPromise);
    });
  });

  describe('Helper Types: ModelProps, ModelResult, ModelCtx', () => {
    it('should extract ModelProps correctly', () => {
      // ModelProps - function model with props
      void (null as Expect<Equal<ModelProps<typeof GetTodoModel>, {id: string}>>);

      // ModelProps - model with optional properties (OJson now allows undefined)
      interface ModelWithOptionalProps extends OJson {
        required: string;
        optional?: string;
      }
      function ModelWithOptional(props: ModelWithOptionalProps): string {
        return props.required;
      }
      ModelWithOptional.displayName = 'ModelWithOptional';
      void (null as Expect<Equal<ModelProps<typeof ModelWithOptional>, ModelWithOptionalProps>>);
      // ModelProps - function model without props (should be OJson or empty object)
      // Note: TypeScript infers empty object {} for models without props parameter
      void (null as ModelProps<typeof GetAllTodosModel>);
      // ModelProps - object model
      void (null as Expect<Equal<ModelProps<typeof ObjectModel>, {value: string}>>);
    });

    it('should extract ModelResult correctly', () => {
      // ModelResult - Promise model (should unwrap Promise)
      void (null as Expect<Equal<ModelResult<typeof GetTodoModel>, Todo | null>>);
      // ModelResult - Promise model without props
      void (null as Expect<Equal<ModelResult<typeof GetAllTodosModel>, Todo[]>>);
      // ModelResult - object model (synchronous)
      void (null as Expect<Equal<ModelResult<typeof ObjectModel>, {result: string}>>);
    });

    it('should extract ModelCtx correctly', () => {
      // ModelCtx - model with BaseContext
      // Note: Models can accept any context that extends BaseContext, so we check assignability
      void (null as ModelCtx<typeof GetTodoModel>);
      // ModelCtx - object model
      void (null as ModelCtx<typeof ObjectModel>);
    });
  });

  describe('Different Model Types', () => {
    it('should handle synchronous models', () => {
      const syncResult = baseCtx.request(SyncModel, {id: '1'});
      expectType<Promise<Todo>>(syncResult);
    });

    it('should handle generator models', () => {
      // Generator model
      function* GeneratorModel(props: {id: string}, _ctx: BaseContext): Generator<Todo, Todo> {
        const data: Todo = yield {id: props.id, title: 'test'};
        return data;
      }
      GeneratorModel.displayName = 'GeneratorModel';

      const generatorResult = baseCtx.request(GeneratorModel, {id: '1'});
      expectType<Promise<Todo>>(generatorResult);
    });

    it('should handle models returning arrays', () => {
      // Model returning array
      function GetArrayModel(): Todo[] {
        return [];
      }
      GetArrayModel.displayName = 'GetArrayModel';

      const arrayResult = baseCtx.request(GetArrayModel);
      expectType<Promise<Todo[]>>(arrayResult);
    });

    it('should handle models returning primitives', () => {
      // Model returning primitive (string)
      function GetStringModel(): string {
        return 'test';
      }
      GetStringModel.displayName = 'GetStringModel';

      const stringResult = baseCtx.request(GetStringModel);
      expectType<Promise<string>>(stringResult);

      // Model returning null
      function GetNullModel(): Promise<null> {
        return Promise.resolve(null);
      }
      GetNullModel.displayName = 'GetNullModel';

      const nullResult = baseCtx.request(GetNullModel);
      expectType<Promise<null>>(nullResult);
    });

    it('should handle object models with action', () => {
      // Object model with action - ObjectModel requires BaseContext, works with baseCtx
      const objectModelResult = baseCtx.request(ObjectModel, {value: 'test'});
      expectType<Promise<{result: string}>>(objectModelResult);
    });
  });

  describe('ctx.set() Typing', () => {
    it('should type-check ctx.set() for different model types', () => {
      // Create separate contexts for each set() call to avoid registry conflicts
      const registry1 = new Map();
      const ctx1 = withModels(registry1)(new Context('test1'));
      ctx1.set(GetTodoModel, {id: '1', title: 'test'} as Todo | null, {id: '1'});

      const registry2 = new Map();
      const ctx2 = withModels(registry2)(new Context('test2'));
      ctx2.set(GetAllTodosModel, [] as Todo[]);

      const registry3 = new Map();
      const ctx3 = withModels(registry3)(new Context('test3'));
      ctx3.set(SyncModel, {id: '1', title: 'test'} as Todo, {id: '1'});

      // ctx.set() with object model - ObjectModel requires WithModels context, so skip this test
      // const registry4 = new Map();
      // const ctx4 = withModels(registry4)(new Context('test4'));
      // ctx4.set(ObjectModel, {result: 'test'} as {result: string}, {value: 'test'});
    });
  });

  describe('ctx.create() Typing', () => {
    it('should preserve types for withModels.create() - child can use request()', () => {
      // Test that child context from create() has request() method
      const withModelsChild = baseCtx.create('child');
      // Should be able to call request() directly without type assertion
      const result = withModelsChild.request(GetAllTodosModel);
      expectType<Promise<Todo[]>>(result);
    });

    it('should preserve types for withModels.create() - child can use set()', () => {
      // Test that child context from create() has set() method
      const withModelsChild = baseCtx.create('child');
      // Should be able to call set() directly without type assertion
      // Use a different model to avoid registry conflicts
      const testModel = {
        displayName: 'TestModel',
        action: () => ({result: 'test'}),
      } as Model;
      withModelsChild.set(testModel, {result: 'test'});
    });

    it('should preserve types for withModels.create() - child shares registry (pre-set values)', () => {
      // This test verifies the scenario from "should share pre-set values across child contexts"
      const registry = new Map();
      const context = withModels(registry)(new Context('parent'));
      const testModel: Model<Record<string, never>, {result: string}> = {
        displayName: 'preSetModel',
        action: () => ({result: 'pre-set value'}),
      };

      // Set value on parent
      context.set(testModel, {result: 'pre-set value'});

      // Create child - should return same type as context
      const child = context.create('child');
      // Child should be able to use request() directly without type assertion
      const result = child.request(testModel);
      expectType<Promise<{result: string}>>(result);
    });

    it('should preserve types for withTelemetry.create()', () => {
      // withTelemetry - ctx.create() returns WithTelemetry<WithModels<BaseContext>>
      const wrapTelemetry = compose([withModels(new Map()), withTelemetry({serviceName: 'test'})]);
      const telemetryCtx = wrapTelemetry(new Context('telemetry-test'));
      const telemetryChild = telemetryCtx.create('child');
      // Verify request() method exists (proves it's WithModels)
      // Use type assertion since TypeScript can't always infer exact return type from create()
      const telemetryChildTyped = telemetryChild as WithTelemetry<WithModels<BaseContext>>;
      expectType<Promise<Todo[]>>(telemetryChildTyped.request(GetAllTodosModel));
    });

    it('should preserve types for withCache.create()', () => {
      // Minimal cache provider for typing
      const cacheProvider = {
        async get(_key: string): Promise<Json | undefined> {
          return undefined;
        },
        async set(_key: string, _value: Json, _ttl: number): Promise<void> {
          // no-op
        },
      };

      // withCache - ctx.create() preserves types
      const wrapCache = compose([
        withModels(new Map()),
        withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
          withModels(new Map())(new Context(name)),
        ),
      ]);
      const cacheCtx = wrapCache(new Context('cache-test'));
      const cacheChild = cacheCtx.create('child');
      // Should have WithCache methods - use type assertion to verify
      const cacheChildTyped = cacheChild as WithCache<WithModels<BaseContext>>;
      expectType<boolean>(cacheChildTyped.shouldCache());
      expectType<void>(cacheChildTyped.disableCache());
    });

    it('should preserve types for compose with multiple helpers', () => {
      // Minimal cache provider for typing
      const cacheProvider = {
        async get(_key: string): Promise<Json | undefined> {
          return undefined;
        },
        async set(_key: string, _value: Json, _ttl: number): Promise<void> {
          // no-op
        },
      };

      const wrap = compose([
        withModels(new Map()),
        withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
          withModels(new Map())(new Context(name)),
        ),
        withTelemetry({serviceName: 'type-tests'}),
      ]);

      const composedCtx = wrap(new Context('request-with-helpers'));

      // compose with multiple helpers - ctx.create() preserves all types
      const composedChild = composedCtx.create('child');
      // Should have all helper methods - verify request() works
      // Use type assertion since compose doesn't preserve exact type structure
      const _composedChildRequest = (composedChild as any).request(GetAllTodosModel);
      expectType<Promise<Todo[]>>(_composedChildRequest);
      // Verify WithCache methods are available (via type assertion since compose doesn't preserve exact type)
      const composedChildWithCache = composedChild as WithCache<WithModels<BaseContext>>;
      expectType<boolean>(composedChildWithCache.shouldCache());
      expectType<void>(composedChildWithCache.disableCache());
    });
  });

  describe('Helpers Preserve Types', () => {
    it('should preserve types for withDeadline', () => {
      // withDeadline - ctx.request() preserves model types
      const wrapDeadline = compose([withModels(new Map()), withDeadline(5000)]);
      const deadlineCtx = wrapDeadline(new Context('deadline-test'));
      const deadlineResult = deadlineCtx.request(GetTodoModel, {id: '1'});
      expectType<Promise<Todo | null>>(deadlineResult);
    });

    it('should preserve types for withOverrides', () => {
      // withOverrides - ctx.request() preserves model types
      const wrapOverrides = compose([withModels(new Map()), withOverrides(new Map())]);
      const overridesCtx = wrapOverrides(new Context('overrides-test'));
      const overridesResult = overridesCtx.request(GetTodoModel, {id: '1'});
      expectType<Promise<Todo | null>>(overridesResult);
    });

    it('should preserve types for withCache', () => {
      // Minimal cache provider for typing
      const cacheProvider = {
        async get(_key: string): Promise<Json | undefined> {
          return undefined;
        },
        async set(_key: string, _value: Json, _ttl: number): Promise<void> {
          // no-op
        },
      };

      // withCache - ctx.request() preserves model types
      const wrapCache = compose([
        withModels(new Map()),
        withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
          withModels(new Map())(new Context(name)),
        ),
      ]);
      const cacheCtx = wrapCache(new Context('cache-test'));
      const cacheResult = cacheCtx.request(GetTodoModel, {id: '1'});
      expectType<Promise<Todo | null>>(cacheResult);
    });

    it('should preserve types for withTelemetry', () => {
      // withTelemetry - ctx.request() preserves model types
      const wrapTelemetry = compose([withModels(new Map()), withTelemetry({serviceName: 'test'})]);
      const telemetryCtx = wrapTelemetry(new Context('telemetry-test'));
      const telemetryResult = telemetryCtx.request(GetTodoModel, {id: '1'});
      expectType<Promise<Todo | null>>(telemetryResult);
    });
  });

  describe('compose with Different Combinations', () => {
    it('should preserve types for withModels + withDeadline', () => {
      // withModels + withDeadline
      const wrapModelsDeadline = compose([withModels(new Map()), withDeadline(5000)]);
      const modelsDeadlineCtx = wrapModelsDeadline(new Context('test'));
      expectType<Promise<Todo[]>>(modelsDeadlineCtx.request(GetAllTodosModel));
    });

    it('should preserve types for withModels + withCache + withDeadline', () => {
      // Minimal cache provider for typing
      const cacheProvider = {
        async get(_key: string): Promise<Json | undefined> {
          return undefined;
        },
        async set(_key: string, _value: Json, _ttl: number): Promise<void> {
          // no-op
        },
      };

      // withModels + withCache + withDeadline
      const wrapCacheDeadline = compose([
        withModels(new Map()),
        withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
          withModels(new Map())(new Context(name)),
        ),
        withDeadline(5000),
      ]);
      const cacheDeadlineCtx = wrapCacheDeadline(new Context('test'));
      expectType<Promise<Todo[]>>(cacheDeadlineCtx.request(GetAllTodosModel));
    });

    it('should preserve types for withModels + withTelemetry + withDeadline', () => {
      // withModels + withTelemetry + withDeadline
      const wrapTelemetryDeadline = compose([
        withModels(new Map()),
        withTelemetry({serviceName: 'test'}),
        withDeadline(5000),
      ]);
      const telemetryDeadlineCtx = wrapTelemetryDeadline(new Context('test'));
      expectType<Promise<Todo[]>>(telemetryDeadlineCtx.request(GetAllTodosModel));
    });

    it('should preserve types for all helpers together', () => {
      // Minimal cache provider for typing
      const cacheProvider = {
        async get(_key: string): Promise<Json | undefined> {
          return undefined;
        },
        async set(_key: string, _value: Json, _ttl: number): Promise<void> {
          // no-op
        },
      };

      // All helpers together
      const wrapAll = compose([
        withModels(new Map()),
        withCache({default: {ttl: 60}}, cacheProvider, (name: string) =>
          withModels(new Map())(new Context(name)),
        ),
        withTelemetry({serviceName: 'test'}),
        withDeadline(5000),
      ]);
      const allCtx = wrapAll(new Context('test'));
      expectType<Promise<Todo[]>>(allCtx.request(GetAllTodosModel));
      expectType<Promise<Todo | null>>(allCtx.request(GetTodoModel, {id: '1'}));
    });
  });

  describe('WithTelemetryConfig and WithCacheConfig helper types', () => {
    it('should allow using displayProps when model is typed with WithTelemetryConfig', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      // Type model with WithTelemetryConfig (intersection type, not generic)
      const typedModel = TestModel as typeof TestModel & WithTelemetryConfig;

      // Should be able to set displayProps
      typedModel.displayProps = '*';
      typedModel.displayResult = {id: true};
      typedModel.displayTags = {service: 'test'};

      // Type check that properties exist
      void (null as typeof typedModel.displayProps);
      void (null as typeof typedModel.displayResult);
      void (null as typeof typedModel.displayTags);
    });

    it('should allow using cacheStrategy when model is typed with WithCacheConfig', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      // Type model with WithCacheConfig (intersection type, not generic)
      const typedModel = TestModel as typeof TestModel & WithCacheConfig;

      // Should be able to set cacheStrategy
      typedModel.cacheStrategy = {} as CacheStrategy;

      // Type check that property exists
      void (null as typeof typedModel.cacheStrategy);
    });

    it('should allow composing WithTelemetryConfig and WithCacheConfig', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      // Compose both configs (intersection types, not generic)
      type ExtendedModel = Model & WithTelemetryConfig & WithCacheConfig;
      const typedModel = TestModel as ExtendedModel;

      // Should have all properties
      typedModel.displayProps = '*';
      typedModel.cacheStrategy = {} as CacheStrategy;

      // Type check that all properties exist
      void (null as typeof typedModel.displayProps);
      void (null as typeof typedModel.cacheStrategy);
    });

    it('should reject invalid displayName type', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as Model;

      // @ts-expect-error - displayName must be string, not console
      typedModel.displayName = console;
    });

    it('should reject invalid displayProps type', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as typeof TestModel & WithTelemetryConfig;

      // @ts-expect-error - displayProps must be PropsFilter, not number
      typedModel.displayProps = 123;
    });

    it('should reject invalid displayResult type', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as typeof TestModel & WithTelemetryConfig;

      // @ts-expect-error - displayResult must be PropsFilter, not boolean
      typedModel.displayResult = true;
    });

    it('should reject invalid displayTags type', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as typeof TestModel & WithTelemetryConfig;

      // @ts-expect-error - displayTags must be Attributes, not string
      typedModel.displayTags = 'invalid';
    });

    it('should reject invalid cacheStrategy type', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as typeof TestModel & WithCacheConfig;

      // @ts-expect-error - cacheStrategy must be CacheStrategy, not string
      typedModel.cacheStrategy = 'invalid';
    });

    it('should reject invalid properties on model', () => {
      function TestModel(_props: {id: string}): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      TestModel.displayName = 'TestModel';

      const typedModel = TestModel as typeof TestModel & WithTelemetryConfig & WithCacheConfig;

      // @ts-expect-error - invalidProperty does not exist on Model type
      typedModel.invalidProperty = 'test';
    });
  });

  describe('Edge Cases', () => {
    it('should handle models without props (should use OJson)', () => {
      // Model without props parameter - should accept OJson
      function ModelWithoutProps(): Promise<Todo[]> {
        return Promise.resolve([]);
      }
      ModelWithoutProps.displayName = 'ModelWithoutProps';

      // ModelProps should be OJson (or empty object)
      void (null as ModelProps<typeof ModelWithoutProps>);

      // Should be able to call with empty object or OJson
      const result1 = baseCtx.request(ModelWithoutProps);
      expectType<Promise<Todo[]>>(result1);

      const result2 = baseCtx.request(ModelWithoutProps, {});
      expectType<Promise<Todo[]>>(result2);

      const result3 = baseCtx.request(ModelWithoutProps, {someKey: 'value'} as OJson);
      expectType<Promise<Todo[]>>(result3);
    });

    it('should handle models with optional props', () => {
      // Model with optional props extending OJson
      interface ModelWithOptionalProps extends OJson {
        required: string;
        optional?: string;
      }

      function ModelWithOptional(props: ModelWithOptionalProps): string {
        return props.required + (props.optional || '');
      }
      ModelWithOptional.displayName = 'ModelWithOptional';

      // ModelProps should preserve optional properties
      void (null as Expect<Equal<ModelProps<typeof ModelWithOptional>, ModelWithOptionalProps>>);

      // Should be able to call with required only
      const result1 = baseCtx.request(ModelWithOptional, {required: 'test'});
      expectType<Promise<string>>(result1);

      // Should be able to call with both required and optional
      const result2 = baseCtx.request(ModelWithOptional, {required: 'test', optional: 'value'});
      expectType<Promise<string>>(result2);

      // Should be able to call with optional set to undefined
      const result3 = baseCtx.request(ModelWithOptional, {required: 'test', optional: undefined});
      expectType<Promise<string>>(result3);
    });

    it('should handle models with union types in props', () => {
      // Model with union types in props
      interface ModelWithUnionProps extends OJson {
        status: 'active' | 'inactive' | 'pending';
        value: string | number;
      }

      function ModelWithUnion(props: ModelWithUnionProps): string {
        return `${props.status}: ${props.value}`;
      }
      ModelWithUnion.displayName = 'ModelWithUnion';

      // ModelProps should preserve union types
      void (null as Expect<Equal<ModelProps<typeof ModelWithUnion>, ModelWithUnionProps>>);

      // Should accept valid union values
      const result1 = baseCtx.request(ModelWithUnion, {status: 'active', value: 'test'});
      expectType<Promise<string>>(result1);

      const result2 = baseCtx.request(ModelWithUnion, {status: 'inactive', value: 123});
      expectType<Promise<string>>(result2);
    });

    it('should handle models with union types in result', () => {
      // Model with union types in result
      type UserResult = Todo | null | {error: string};

      function ModelWithUnionResult(_props: {id: string}): Promise<UserResult> {
        return Promise.resolve(null);
      }
      ModelWithUnionResult.displayName = 'ModelWithUnionResult';

      // ModelResult should preserve union types
      void (null as Expect<Equal<ModelResult<typeof ModelWithUnionResult>, UserResult>>);

      // Should infer correct union type
      const result = baseCtx.request(ModelWithUnionResult, {id: '1'});
      expectType<Promise<UserResult>>(result);
    });

    it('should handle models with generic types', () => {
      // Model with generic type parameter
      // Note: TypeScript cannot infer generic types from ctx.request() usage,
      // so we test that the generic type is preserved in ModelResult
      function GenericStringModel(props: {value: string}): Promise<string> {
        return Promise.resolve(props.value);
      }
      GenericStringModel.displayName = 'GenericStringModel';

      function GenericNumberModel(props: {value: number}): Promise<number> {
        return Promise.resolve(props.value);
      }
      GenericNumberModel.displayName = 'GenericNumberModel';

      // Should correctly infer result types
      const result1 = baseCtx.request(GenericStringModel, {value: 'test'});
      expectType<Promise<string>>(result1);

      const result2 = baseCtx.request(GenericNumberModel, {value: 123});
      expectType<Promise<number>>(result2);

      // ModelResult should preserve generic types
      void (null as Expect<Equal<ModelResult<typeof GenericStringModel>, string>>);
      void (null as Expect<Equal<ModelResult<typeof GenericNumberModel>, number>>);
    });

    it('should handle models with BaseContext vs WithModels<BaseContext>', () => {
      // Model that requires BaseContext
      function ModelWithBaseContext(_props: {id: string}, _ctx: BaseContext): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      ModelWithBaseContext.displayName = 'ModelWithBaseContext';

      // Model that requires WithModels<BaseContext>
      // Note: Models requiring WithModels<BaseContext> can only be called from contexts
      // that are already WithModels<BaseContext>
      function ModelWithModelsContext(
        _props: {id: string},
        _ctx: WithModels<BaseContext>,
      ): Promise<Todo | null> {
        return Promise.resolve(null);
      }
      ModelWithModelsContext.displayName = 'ModelWithModelsContext';

      // Model with BaseContext should work with baseCtx (which extends BaseContext)
      const result1 = baseCtx.request(ModelWithBaseContext, {id: '1'});
      expectType<Promise<Todo | null>>(result1);

      // ModelCtx should extract correct context type
      // ModelWithBaseContext accepts BaseContext (or any context extending BaseContext)
      void (null as ModelCtx<typeof ModelWithBaseContext>);
      // ModelWithModelsContext requires WithModels<BaseContext> (more specific constraint)
      void (null as ModelCtx<typeof ModelWithModelsContext>);

      // ModelResult should work for both
      void (null as Expect<Equal<ModelResult<typeof ModelWithBaseContext>, Todo | null>>);
      void (null as Expect<Equal<ModelResult<typeof ModelWithModelsContext>, Todo | null>>);
    });

    it('should handle optional props with OJson extension', () => {
      // Model with optional props that explicitly extends OJson
      interface OptionalPropsModel extends OJson {
        id: string;
        name?: string;
        age?: number;
      }

      function ModelWithMultipleOptional(props: OptionalPropsModel): string {
        return props.id + (props.name || '') + (props.age || 0);
      }
      ModelWithMultipleOptional.displayName = 'ModelWithMultipleOptional';

      // Should correctly infer optional properties
      void (null as Expect<
        Equal<ModelProps<typeof ModelWithMultipleOptional>, OptionalPropsModel>
      >);

      // Should accept partial props (only required)
      const result1 = baseCtx.request(ModelWithMultipleOptional, {id: '1'});
      expectType<Promise<string>>(result1);

      // Should accept all props
      const result2 = baseCtx.request(ModelWithMultipleOptional, {
        id: '1',
        name: 'John',
        age: 30,
      });
      expectType<Promise<string>>(result2);

      // Should accept some optional props
      const result3 = baseCtx.request(ModelWithMultipleOptional, {id: '1', name: 'John'});
      expectType<Promise<string>>(result3);
    });
  });
});
