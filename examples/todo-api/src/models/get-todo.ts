import type {OJson} from '@ojson/models';
import {todoStore} from './store';
import type {Todo} from './types';
import {defineModel} from '../model-utils';

export interface GetTodoProps extends OJson {
  id: string;
}

/**
 * Model for retrieving a single todo by ID
 */
export const GetTodo = defineModel(
  'GetTodo',
  function GetTodo(props: GetTodoProps): Todo | null {
    const todo = todoStore.getById(props.id);
    return todo || null;
  },
  {
    displayProps: {id: true},
    displayResult: '*',
    displayTags: {
      provider: 'test',
    },
  }
);

