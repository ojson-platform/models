import type {OJson} from '@ojson/models';
import {todoStore} from './store';
import {defineModel} from '../model-utils';

export interface DeleteTodoProps extends OJson {
  id: string;
}

/**
 * Model for deleting a todo
 */
export const DeleteTodo = defineModel(
  'DeleteTodo',
  async function DeleteTodo(props: DeleteTodoProps): Promise<boolean> {
    // Симуляция асинхронной операции
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return todoStore.delete(props.id);
  }
);

