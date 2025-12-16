/**
 * Type tests for model type inference.
 * 
 * These tests verify that TypeScript correctly infers types from models
 * when using ctx.request(). They use @ts-expect-error to ensure type safety.
 */

import type {Request, Response} from 'express';
import {Context, withModels, withDeadline, compose, type WithModels, type Key} from '@ojson/models';
import {
  GetAllTodos,
  GetTodo,
  CreateTodo,
  UpdateTodo,
  DeleteTodo,
  RequestParams,
  type GetTodoProps,
  type CreateTodoProps,
  type UpdateTodoProps,
  type DeleteTodoProps,
} from './models';
import type {Todo} from './models/types';

// Тип контекста для Express
type ExpressContext = Context & {
  req: Request;
  res: Response;
};

type RequestContext = WithModels<ExpressContext>;

// Helper для создания тестового контекста
function createTestContext(): RequestContext {
  const registry = new Map<Key, Promise<unknown>>();
  const baseCtx = new Context('test') as ExpressContext;
  const wrap = compose([withModels(registry), withDeadline(30000)]);
  return wrap(baseCtx) as RequestContext;
}

// Тесты на выведение типов
function typeTests() {
  const ctx = createTestContext();

  // Test 1: GetAllTodos должен возвращать Todo[]
  const allTodos = ctx.request(GetAllTodos);
  // @ts-expect-error - должно быть Promise<Todo[]>, а не Promise<string>
  const _test1: Promise<string> = allTodos;
  // Правильный тип
  const _test3: Promise<Todo[]> = allTodos;

  // Test 2: GetTodo должен возвращать Promise<Todo | null>
  const todo = ctx.request(GetTodo, {id: '123'});
  // @ts-expect-error - должно быть Promise<Todo | null>, а не Promise<string>
  const _test4: Promise<string> = todo;
  // @ts-expect-error - должно быть Promise<Todo | null>, а не Promise<Todo>
  const _test5: Promise<Todo> = todo;
  // Правильный тип
  const _test6: Promise<Todo | null> = todo;

  // Test 3: CreateTodo должен возвращать Promise<Todo>
  const createProps: CreateTodoProps = {title: 'Test'};
  const created = ctx.request(CreateTodo, createProps);
  // @ts-expect-error - должно быть Promise<Todo>, а не Promise<string>
  const _test7: Promise<string> = created;
  // Правильный тип
  const _test9: Promise<Todo> = created;

  // Test 4: UpdateTodo должен возвращать Promise<Todo | null>
  const updateProps: UpdateTodoProps = {id: '123', updates: {title: 'Updated'}};
  const updated = ctx.request(UpdateTodo, updateProps);
  // @ts-expect-error - должно быть Promise<Todo | null>, а не Promise<string>
  const _test10: Promise<string> = updated;
  // @ts-expect-error - должно быть Promise<Todo | null>, а не Promise<Todo>
  const _test11: Promise<Todo> = updated;
  // Правильный тип
  const _test12: Promise<Todo | null> = updated;

  // Test 5: DeleteTodo должен возвращать Promise<boolean>
  const deleteProps: DeleteTodoProps = {id: '123'};
  const deleted = ctx.request(DeleteTodo, deleteProps);
  // @ts-expect-error - должно быть Promise<boolean>, а не Promise<string>
  const _test13: Promise<string> = deleted;
  // @ts-expect-error - должно быть Promise<boolean>, а не Promise<Todo>
  const _test14: Promise<Todo> = deleted;
  // Правильный тип
  const _test15: Promise<boolean> = deleted;

  // Test 6: RequestParams должен возвращать правильный тип
  const params = ctx.request(RequestParams, {});
  // @ts-expect-error - должно быть ExpressRequestParams, а не string
  const _test16: Promise<string> = params;
  // Правильный тип
  const _test17: Promise<{params: Record<string, string>; query: Record<string, string>; body: unknown}> = params;

  // Test 7: Проверка типов props
  // @ts-expect-error - GetTodo требует {id: string}, а не {id: number}
  const _test18 = ctx.request(GetTodo, {id: 123});
  // @ts-expect-error - CreateTodo требует {title: string}, а не {title: number}
  const _test19 = ctx.request(CreateTodo, {title: 123});
  // @ts-expect-error - CreateTodo требует {title: string}, а не пустой объект
  const _test20 = ctx.request(CreateTodo, {});
}

// Экспортируем функцию, чтобы TypeScript проверил типы при компиляции
export {typeTests};

