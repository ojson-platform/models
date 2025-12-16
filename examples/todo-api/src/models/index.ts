import type {OJson, Json} from '@ojson/models';
import {todoStore} from './store';
import type {Todo} from './types';

// Модель для получения всех todo
function GetAllTodos(): Todo[] {
  return todoStore.getAll();
}
GetAllTodos.displayName = 'GetAllTodos';
GetAllTodos.displayResult = '*';
GetAllTodos.displayTags = {
  'provider': 'test'
};

// Модель для получения одного todo по ID
interface GetTodoProps extends OJson {
  id: string;
}

function GetTodo(props: GetTodoProps): Todo | null {
  const todo = todoStore.getById(props.id);
  return todo || null;
}
GetTodo.displayName = 'GetTodo';
GetTodo.displayProps = {id: true};
GetTodo.displayResult = '*';
GetTodo.displayTags = {
  'provider': 'test'
};

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
CreateTodo.displayTags = {
  'provider': 'test'
};

// Модель для обновления todo
interface UpdateTodoProps extends OJson {
  id: string;
  updates: {
    title?: string;
    description?: string;
    completed?: boolean;
  };
}

async function UpdateTodo(props: UpdateTodoProps): Promise<Todo | null> {
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

async function DeleteTodo(props: DeleteTodoProps): Promise<boolean> {
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
// Эта модель не должна вызываться напрямую - её значение устанавливается через ctx.set() в middleware
function RequestParams(): ExpressRequestParams {
  throw new Error('RequestParams should be set via ctx.set() in middleware');
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

