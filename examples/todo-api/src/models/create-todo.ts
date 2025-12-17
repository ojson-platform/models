import type {OJson} from '@ojson/models';
import {todoStore} from './store';
import type {Todo} from './types';
import {defineModel} from '../model-utils';

export interface CreateTodoProps extends OJson {
    title: string;
    description?: string;
}

/**
 * Model for creating a new todo
 */
export const CreateTodo = defineModel(
  'CreateTodo',
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
  },
  {
    displayTags: {
      provider: 'test',
    },
  }
);
