module.exports = {
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  LIMIT_ITEM_SHOW: {
    CONTACT: 10,
    REQUEST_CONTACT: 10,
    ROOM: 20,
  },
  MEMBER_ROLE: {
    ADMIN: 0,
    MEMBER: 1,
    READ_ONLY: 2,
  },
  ROOM_TYPE: {
    GROUP_CHAT: 0,
    DIRECT_CHAT: 1,
    SELF_CHAT: 2,
  },
  INVITATION_TYPE: {
    NOT_NEED_APPROVAL: 0,
    NEED_APPROVAL: 1,
    CANNOT_REQUEST: 2,
  },
  INVITATION_STATUS: {
    IN_ROOM: 700,
    JOIN_AS_MEMBER: 701,
    HAVE_REQUEST_BEFORE: 702,
    CANT_JOIN: 703,
    WAITING_APPROVE: 704,
  },
  FILTER_TYPE: {
    LIST_ROOM: {
      ALL: 0,
      UNREAD: 1,
      PINNED: 2,
      GROUP: 3,
      DIRECT: 4,
      SELF: 5,
    },
  },
  LIMIT_MESSAGE: {
    COUNT_UNREAD: 1000,
    NEXT_MESSAGE: 10,
  },
  DIR_UPLOAD_FILE: {
    USER_AVATAR: './public/uploads/user_avatar/',
    ROOM_AVATAR: './public/uploads/room_avatar/',
  },
  ROOM: {
    LIMIT_REPRESENTATIVE_MEMBER: 5,
  },
  LIMIT_REQUEST: 50,
  TASK: {
    STATUS: {
      NEW: 0,
      IN_PROGRESS: 1,
      PENDING: 2,
      DONE: 3,
      REJECT: 4,
    },
    TYPE: {
      MY_TASKS: 1,
      TASKS_ASSIGNED: 2,
    },
  },
};
