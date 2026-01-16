import type {Model, OJson} from '../types';

import {describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {compose} from '../utils';

import {withValidation} from './with-validation';
import {ValidationError} from './types';

describe('withValidation', () => {
  it('should validate props before executing the model (strict)', async () => {
    const model = vi.fn(() => ({ok: true})) as unknown as Model;
    model.displayName = 'TestModel';
    (model as any).schemaProps = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 1},
      },
      additionalProperties: false,
    };

    const ctx = compose([withModels(new Map()), withValidation()])(new Context('request'));

    await expect(ctx.request(model as any, {id: ''})).rejects.toBeInstanceOf(ValidationError);
    expect(model).not.toHaveBeenCalled();

    // Valid request executes exactly once and is memoized by withModels.
    await expect(ctx.request(model as any, {id: '1'})).resolves.toEqual({ok: true});
    await expect(ctx.request(model as any, {id: '1'})).resolves.toEqual({ok: true});
    expect(model).toHaveBeenCalledTimes(1);
  });

  it('should emit event and still execute the model (non-strict)', async () => {
    const model = vi.fn(() => ({ok: true})) as unknown as Model;
    model.displayName = 'TestModel';
    (model as any).schemaProps = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 1},
      },
    };

    const ctx = compose([withModels(new Map()), withValidation({strict: false})])(
      new Context('request'),
    ) as any;

    ctx.event = vi.fn();

    await expect(ctx.request(model, {id: ''})).resolves.toEqual({ok: true});
    expect(model).toHaveBeenCalledTimes(1);
    expect(ctx.event).toHaveBeenCalledWith(
      'validation.failed',
      expect.objectContaining({
        stage: 'props',
        source: 'request',
        validator: 'json-schema',
        model: 'TestModel',
        count: 1,
      }),
    );
  });

  it('should validate nested objects and arrays', async () => {
    interface Props extends OJson {
      user: {email: string};
      tags: string[];
    }

    const model = vi.fn((_props: Props) => ({ok: true})) as unknown as Model;
    model.displayName = 'Nested';
    (model as any).schemaProps = {
      type: 'object',
      required: ['user', 'tags'],
      properties: {
        user: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {type: 'string', format: 'email'},
          },
          additionalProperties: false,
        },
        tags: {
          type: 'array',
          items: {type: 'string', minLength: 1},
        },
      },
      additionalProperties: false,
    };

    const ctx = compose([withModels(new Map()), withValidation()])(new Context('request'));

    await expect(
      ctx.request(model as any, {user: {email: 'nope'}, tags: ['ok', '']}),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      ctx.request(model as any, {user: {email: 'a@b.co'}, tags: ['x']}),
    ).resolves.toEqual({ok: true});
  });

  it('ctx.validate should emit event on the current context (non-strict)', async () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 1},
      },
    };

    const parent = compose([withModels(new Map()), withValidation({strict: false})])(
      new Context('request'),
    ) as any;
    const child = parent.create('child') as any;

    parent.event = vi.fn();
    child.event = vi.fn();

    const issues = child.validate({id: ''}, schema);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({path: '$.id'});

    expect(child.event).toHaveBeenCalledWith(
      'validation.failed',
      expect.objectContaining({
        stage: 'manual',
        source: 'validate',
        validator: 'json-schema',
        count: 1,
      }),
    );
    expect(parent.event).not.toHaveBeenCalled();
  });

  it('should validate schemaResult and avoid returning invalid results', async () => {
    const model = vi.fn(() => ({ok: true})) as unknown as Model;
    model.displayName = 'ResultValidated';
    (model as any).schemaProps = {type: 'object'};
    (model as any).schemaResult = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 1},
      },
      additionalProperties: false,
    };

    const ctx = compose([withModels(new Map()), withValidation({strict: false})])(
      new Context('request'),
    ) as any;
    ctx.event = vi.fn();

    await expect(ctx.request(model as any, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(ctx.request(model as any, {})).rejects.toBeInstanceOf(ValidationError);

    // Note: result validation happens after `withModels` has executed the model,
    // so the underlying result may still be memoized, but callers still see a
    // validation error on every request.
    expect(model).toHaveBeenCalledTimes(1);

    // Even in non-strict mode, result validation still throws, but it should also emit an event.
    expect(ctx.event).toHaveBeenCalledTimes(2);
    expect(ctx.event).toHaveBeenNthCalledWith(
      1,
      'validation.failed',
      expect.objectContaining({
        stage: 'result',
        source: 'request',
        validator: 'json-schema',
        model: 'ResultValidated',
        count: 2,
      }),
    );
  });
});
