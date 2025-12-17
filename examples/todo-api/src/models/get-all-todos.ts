import {todoStore} from './store';
import type {Todo} from './types';
import {defineModel} from '../model-utils';

/**
 * Model for retrieving all todos
 */
export const GetAllTodos = defineModel(
  'GetAllTodos',
  function GetAllTodos(): Todo[] {
    return todoStore.getAll();
  },
  {
    displayResult: '*',
    displayTags: {
      provider: 'test',
    },
  }
);

