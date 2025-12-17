import type {OJson} from '@ojson/models';

import type {Todo} from './types';

import {defineModel} from '../model-utils';
import {todoStore} from '../data/store';

/**
 * Props for CreateTodo model.
 * Now we can use `extends OJson` because OJson allows undefined values
 * for optional properties.
 */
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
    
    // Добавляем description только если значение есть (undefined пропускается)
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
