export const config = {
  STATUS: {
    NEW: {
      VALUE: 0,
      TITLE: 'task.new',
      COLOR: '',
      STATUS: 'active',
    },
    IN_PROGRESS: {
      VALUE: 10,
      TITLE: 'task.in_progress',
      COLOR: '#1890ff',
      STATUS: 'active',
    },
    PENDING: {
      VALUE: 20,
      TITLE: 'task.pending',
      COLOR: '#fa8700',
      STATUS: 'normal',
    },
    DONE: {
      VALUE: 30,
      TITLE: 'task.done',
      COLOR: '#52c41a',
      STATUS: 'success',
    },
    REJECT: {
      VALUE: 40,
      TITLE: 'task.reject',
      COLOR: '#f5222d',
      STATUS: 'exception',
    },
  },
  TYPE: {
    MY_TASKS: 1,
    TASKS_ASSIGNED: 2,
  },
  LIST_TASKS: {
    MY_TASKS: {
      KEY: 1,
      TITLE: 'title.tasks.my_tasks',
    },
    TASKS_ASSIGNED: {
      KEY: 2,
      TITLE: 'title.tasks.tasks_assigned',
    },
    ALL: {
      KEY: 0,
      TITLE: 'title.tasks.all',
    },
  },
};
