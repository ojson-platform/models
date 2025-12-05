import type {OJson, Json, Context} from '@ojson/models';
import type {Request, Response} from 'express';
import {todoStore} from './store';
import type {Todo} from './types';

// Тип контекста для Express моделей
type ExpressContext = Context & {
  req: Request;
  res: Response;
};

interface ExpressResponse {
  json: (data: unknown) => void;
}

// Модель для получения всех todo
function GetAllTodos(): Todo[] {
  return todoStore.getAll();
}
GetAllTodos.displayName = 'GetAllTodos';

// Модель для получения одного todo по ID
interface GetTodoProps extends OJson {
  id: string;
}

function GetTodo(props: GetTodoProps) {
  const todo = todoStore.getById(props.id);
  return todo || null;
}
GetTodo.displayName = 'GetTodo';

// Модель для создания todo
type CreateTodoProps = OJson & {
  title: string;
  description?: string;
}

async function CreateTodo(props: CreateTodoProps): Promise<Todo> {
  // Симуляция асинхронной операции (например, валидация)
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const createData: {title: string; description?: string; completed: boolean} = {
    title: props.title,
    completed: false,
  };
  
  // OJson не допускает undefined, поэтому добавляем только если значение есть
  if ('description' in props && props.description !== undefined) {
    createData.description = props.description;
  }
  
  return todoStore.create(createData);
}
CreateTodo.displayName = 'CreateTodo';

// Модель для обновления todo
interface UpdateTodoProps extends OJson {
  id: string;
  updates: {
    title?: string;
    description?: string;
    completed?: boolean;
  };
}

async function UpdateTodo(props: UpdateTodoProps, ctx: ExpressContext): Promise<Todo | null> {
  // Симуляция асинхронной операции
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const todo = todoStore.update(props.id, props.updates);
  return todo || null;
}
UpdateTodo.displayName = 'UpdateTodo';

// Модель для удаления todo
interface DeleteTodoProps extends OJson {
  id: string;
}

async function DeleteTodo(props: DeleteTodoProps, ctx: ExpressContext): Promise<boolean> {
  // Симуляция асинхронной операции
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return todoStore.delete(props.id);
}
DeleteTodo.displayName = 'DeleteTodo';

// Тип для параметров запроса Express (расширяет OJson для совместимости)
export interface ExpressRequestParams extends OJson {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Json;
}

// Модель для получения параметров запроса из Express
function RequestParams(props: OJson, ctx: ExpressContext): ExpressRequestParams {
  return {
    params: (ctx.req.params || {}) as Record<string, string>,
    query: (ctx.req.query || {}) as Record<string, string>,
    body: (ctx.req.body || {}) as Json,
  };
}
RequestParams.displayName = 'RequestParams';

export {
  GetAllTodos,
  GetTodo,
  CreateTodo,
  UpdateTodo,
  DeleteTodo,
  RequestParams,
};

export type {
  GetTodoProps,
  CreateTodoProps,
  UpdateTodoProps,
  DeleteTodoProps,
};

