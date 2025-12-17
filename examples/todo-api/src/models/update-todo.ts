import type {OJson} from '@ojson/models';
import {todoStore} from './store';
import type {Todo} from './types';
import {defineModel} from '../model-utils';

export interface UpdateTodoProps extends OJson {
  id: string;
  updates: {
    title?: string;
    description?: string;
    completed?: boolean;
  };
}

/**
 * Model for updating an existing todo
 */
export const UpdateTodo = defineModel(
  'UpdateTodo',
  async function UpdateTodo(props: UpdateTodoProps): Promise<Todo | null> {
    // Симуляция асинхронной операции
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const todo = todoStore.update(props.id, props.updates);
    return todo || null;
  }
);

