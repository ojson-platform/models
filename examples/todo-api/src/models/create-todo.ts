import {todoStore} from './store';
import type {Todo} from './types';
import {defineModel} from '../model-utils';

/**
 * Props for CreateTodo model.
 * Note: We don't use `extends OJson` here because optional properties
 * (like `description?: string`) have type `string | undefined`, which conflicts
 * with OJson's index signature `[prop: string]: Json` (undefined is not Json).
 * TypeScript will still check structural compatibility with OJson when the model is used.
 */
export interface CreateTodoProps {
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
