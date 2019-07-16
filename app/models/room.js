const mongoose = require('mongoose');
const config = require('../../config/config');

mongoose.set('useFindAndModify', false);

const Schema = mongoose.Schema;

// Setup schema
const Messages = new Schema(
  {
    content: { type: String },
    is_notification: { type: Boolean, default: false },
    user: { type: Schema.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const Members = new Schema(
  {
    user: { type: Schema.ObjectId, ref: 'User' },
    role: { type: Number, default: config.MEMBER_ROLE.MEMBER }, //0: admin - 1: member - 2: read-only
    last_message_id: { type: Schema.ObjectId, ref: 'Messages', default: null },
    pinned: { type: Boolean, default: false },
    room_group: { type: Schema.ObjectId, ref: 'Room_group' },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const Tasks = new Schema(
  {
    content: { type: String },
    start: { type: Date, default: Date.now() },
    due: { type: Date },
    assigner: { type: Schema.ObjectId, ref: 'User' },
    assignees: [
      {
        user: { type: Schema.ObjectId, ref: 'User' },
        status: { type: Number, default: config.TASK.STATUS.NEW }, // 0:new - 10:in-progress - 20:pending - 30:done - 40:reject
        percent: { type: Number, default: 0 },
      },
    ],
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const Files = new Schema(
  {
    name: { type: String },
    path: { type: String },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const RoomSchema = new Schema(
  {
    name: { type: String },
    desc: { type: String },
    type: { type: Number, default: config.ROOM_TYPE.GROUP_CHAT }, //0: group chat - 1: direct chat
    invitation_code: {
      type: String,
      // unique: true,
      default:
        Math.random()
          .toString(36)
          .substring(2, 35) + new Date().getTime(),
    },
    invitation_type: { type: Number, default: config.INVITATION_TYPE.NOT_NEED_APPROVAL }, //0: don't need admin approves - 1: need admin approves
    avatar: { type: String },
    members: [Members],
    messages: [Messages],
    tasks: [Tasks],
    files: [Files],
    incoming_requests: [
      {
        type: Schema.ObjectId,
        ref: 'User',
      },
    ],
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

RoomSchema.statics = {
  load: function(options, cb) {
    options.select = options.select || 'name';
    return this.findOne(options.criteria)
      .select(options.select)
      .exec(cb);
  },

  getListRoomByUserId: function({ userId, filter_type = 0, limit, page = 0 }) {
    let list_filter_type_chat = [],
      default_quantity_unread = config.LIMIT_MESSAGE.COUNT_UNREAD,
      filter_unread = { $match: { quantity_unread: { $gt: 0 } } },
      filter_pinned = { $match: { 'last_msg_id_reserve.pinned': true } },
      filter_group = { 'members.user': mongoose.Types.ObjectId(userId), type: config.ROOM_TYPE.GROUP_CHAT },
      filter_direct = { 'members.user': { $ne: mongoose.Types.ObjectId(userId) }, type: config.ROOM_TYPE.DIRECT_CHAT },
      filter_self = { 'members.user': mongoose.Types.ObjectId(userId), type: config.ROOM_TYPE.SELF_CHAT };

    filter_type = parseInt(filter_type);

    let query = [
      { $match: { deletedAt: null, 'members.user': mongoose.Types.ObjectId(userId) } },
      {
        $addFields: {
          last_msg_id_reserve: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$members',
                  as: 'mem',
                  cond: {
                    $and: [
                      { $eq: ['$$mem.deletedAt', null] },
                      { $eq: ['$$mem.user', mongoose.Types.ObjectId(userId)] },
                    ],
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          message_able: {
            $filter: {
              input: '$messages',
              as: 'mes',
              cond: {
                $and: [
                  { $eq: ['$$mes.deletedAt', null] },
                  { $gt: ['$$mes._id', '$last_msg_id_reserve.last_message_id'] },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          message_able: { $slice: ['$message_able', -1 * default_quantity_unread] },
        },
      },
      { $unwind: '$members' },
    ];

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.GROUP) {
      list_filter_type_chat.push(filter_group);
    } else if (filter_type === config.FILTER_TYPE.LIST_ROOM.DIRECT) {
      list_filter_type_chat.push(filter_direct);
    } else if (filter_type === config.FILTER_TYPE.LIST_ROOM.SELF) {
      list_filter_type_chat.push(filter_self);
    } else {
      list_filter_type_chat = [filter_group, filter_direct, filter_self];
    }

    query.push({
      $match: {
        'members.deletedAt': null,
        $or: list_filter_type_chat,
      },
    });

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.PINNED) {
      query.push(filter_pinned);
    }

    query.push(
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user_info',
        },
      },
      {
        $project: {
          name: {
            $cond: {
              if: { $in: ['$type', [config.ROOM_TYPE.GROUP_CHAT, config.ROOM_TYPE.SELF_CHAT]] },
              then: '$name',
              else: { $arrayElemAt: ['$members.user_info.name', 0] },
            },
          },
          avatar: {
            $cond: {
              if: { $eq: ['$type', config.ROOM_TYPE.GROUP_CHAT] },
              then: '$avatar',
              else: { $arrayElemAt: ['$members.user_info.avatar', 0] },
            },
          },
          type: 1,
          last_created_msg: { $max: '$messages.createdAt' },
          pinned: '$last_msg_id_reserve.pinned',
          quantity_unread: { $size: '$message_able' },
        },
      }
    );

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.UNREAD) {
      query.push(filter_unread);
    }

    query.push(
      {
        $sort: {
          pinned: -1,
          last_created_msg: -1,
        },
      },
      { $skip: limit * page },
      {
        $limit: 20,
      }
    );

    return this.aggregate(query).exec();
  },

  getQuantityRoomsByUserId: function(_id, filter_type = 0) {
    let list_filter_type_chat = [],
      filter_unread = { $match: { quantity_unread: true } },
      filter_pinned = { $match: { 'members.pinned': true } },
      filter_group = { type: config.ROOM_TYPE.GROUP_CHAT },
      filter_direct = { type: config.ROOM_TYPE.DIRECT_CHAT },
      filter_self = { type: config.ROOM_TYPE.SELF_CHAT };

    filter_type = parseInt(filter_type);

    let query = [
      {
        $match: { deletedAt: null, 'members.user': mongoose.Types.ObjectId(_id) },
      },
      { $unwind: '$members' },
    ];

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.GROUP) {
      list_filter_type_chat.push(filter_group);
    } else if (filter_type === config.FILTER_TYPE.LIST_ROOM.DIRECT) {
      list_filter_type_chat.push(filter_direct);
    } else if (filter_type === config.FILTER_TYPE.LIST_ROOM.SELF) {
      list_filter_type_chat.push(filter_self);
    } else {
      list_filter_type_chat = [filter_group, filter_direct, filter_self];
    }

    query.push({
      $match: {
        'members.user': mongoose.Types.ObjectId(_id),
        'members.deletedAt': null,
        $or: list_filter_type_chat,
      },
    });

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.PINNED) {
      query.push(filter_pinned);
    }

    if (filter_type === config.FILTER_TYPE.LIST_ROOM.UNREAD) {
      query.push({
        $addFields: {
          message_able: {
            $filter: {
              input: '$messages',
              as: 'mes',
              cond: { $eq: ['$$mes.deletedAt', null] },
            },
          },
        },
      });

      query.push({
        $addFields: {
          quantity_unread: {
            $gt: [{ $arrayElemAt: ['$message_able._id', -1] }, '$members.last_message_id'],
          },
        },
      });

      query.push(filter_unread);
    }
    query.push({
      $count: 'result',
    });

    return this.aggregate(query).exec();
  },

  getRoomsBySubName: function({ userId, sub_name }) {
    return this.aggregate([
      { $match: { deletedAt: null, 'members.user': mongoose.Types.ObjectId(userId) } },
      { $unwind: '$members' },
      {
        $match: {
          'members.deletedAt': null,
          $or: [
            { 'members.user': mongoose.Types.ObjectId(userId), type: config.ROOM_TYPE.GROUP_CHAT },
            { 'members.user': { $ne: mongoose.Types.ObjectId(userId) }, type: config.ROOM_TYPE.DIRECT_CHAT },
          ],
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user_info',
        },
      },
      {
        $addFields: {
          name: {
            $cond: {
              if: { $in: ['$type', [config.ROOM_TYPE.GROUP_CHAT, config.ROOM_TYPE.SELF_CHAT]] },
              then: '$name',
              else: { $arrayElemAt: ['$members.user_info.name', 0] },
            },
          },
          avatar: {
            $cond: {
              if: { $eq: ['$type', config.ROOM_TYPE.GROUP_CHAT] },
              then: '$avatar',
              else: { $arrayElemAt: ['$members.user_info.avatar', 0] },
            },
          },
        },
      },
      {
        $match: { name: { $regex: '^.*' + sub_name + '.*$', $options: 'i' } },
      },
      {
        $project: {
          name: 1,
          avatar: 1,
          type: 1,
        },
      },
    ]);
  },

  getMembersOfRoom(roomId) {
    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      { $unwind: '$members' },
      { $match: { 'members.deletedAt': null } },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user',
        },
      },
      {
        $project: {
          'members.role': 1,
          _id: 0,
          user: { $arrayElemAt: ['$members.user', 0] },
        },
      },
      {
        $project: {
          members: 1,
          'user._id': 1,
          'user.name': 1,
          'user.username': 1,
          'user.email': 1,
          'user.avatar': 1,
          'user.phone_number': 1,
          'user.full_address': 1,
          'user.twitter': 1,
          'user.github': 1,
          'user.google': 1,
        },
      },
    ]);
  },

  getTasksOfRoom(roomId, userId, type) {
    let query = [{ $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } }, { $unwind: '$tasks' }];

    if (type == config.TASK.TYPE.TASKS_ASSIGNED) {
      query.push({
        $match: { 'tasks.deletedAt': null, 'tasks.assigner': mongoose.Types.ObjectId(userId) },
      });
    } else if (type == config.TASK.TYPE.MY_TASKS) {
      query.push({
        $match: { 'tasks.deletedAt': null, $expr: { $in: [mongoose.Types.ObjectId(userId), '$tasks.assignees.user'] } },
      });
    } else {
      query.push({
        $match: { 'tasks.deletedAt': null },
      });
    }

    query.push(
      {
        $lookup: {
          from: 'users',
          let: { userId: '$tasks.assigner' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$_id', '$$userId'],
                },
              },
            },
            { $project: { _id: 1, avatar: 1, name: 1 } },
          ],
          as: 'tasks.assigner',
        },
      },
      { $unwind: '$tasks.assignees' },
      {
        $lookup: {
          from: 'users',
          let: {
            assigneeId: '$tasks.assignees.user',
            status: '$tasks.assignees.status',
            percent: '$tasks.assignees.percent',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$_id', '$$assigneeId'],
                },
              },
            },
            { $project: { user: '$_id', _id: 0, avatar: 1, name: 1, status: '$$status', percent: '$$percent' } },
          ],
          as: 'tasks.assignees',
        },
      },
      {
        $group: {
          _id: '$tasks._id',
          content: { $first: '$tasks.content' },
          assigner: { $first: { $arrayElemAt: ['$tasks.assigner', 0] } },
          assignees: { $push: { $arrayElemAt: ['$tasks.assignees', 0] } },
          start: { $first: '$tasks.start' },
          due: { $first: '$tasks.due' },
          createdAt: { $first: '$tasks.createdAt' },
          updatedAt: { $first: '$tasks.updatedAt' },
        },
      }
    );

    return this.aggregate(query).exec();
  },

  getListNotMember: function({ _id, subName, listMember }) {
    var query = [];

    query.push(
      {
        $match: {
          type: config.ROOM_TYPE.DIRECT_CHAT,
          deletedAt: null,
          $expr: { $in: [mongoose.Types.ObjectId(_id), '$members.user'] },
        },
      },
      {
        $unwind: '$members',
      },
      {
        $match: {
          $expr: {
            $and: [{ $not: [{ $eq: [_id, '$members.user'] }] }, { $not: [{ $in: ['$members.user', listMember] }] }],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user_info',
        },
      }
    );

    if (subName) {
      query.push({
        $match: {
          $or: [
            { 'members.user_info.name': { $regex: '^.*' + subName + '.*$', $options: 'i' } },
            { 'members.user_info.email': { $regex: '^.*' + subName + '.*$', $options: 'i' } },
          ],
        },
      });
    }

    query.push(
      {
        $replaceRoot: { newRoot: { $arrayElemAt: ['$members.user_info', 0] } },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          avatar: 1,
          email: 1,
        },
      }
    );

    return this.aggregate(query);
  },

  getListIdMember: function(roomId) {
    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      {
        $addFields: {
          members: {
            $filter: {
              input: '$members',
              as: 'member_able',
              cond: { $eq: ['$$member_able.deletedAt', null] },
            },
          },
        },
      },
      {
        $project: {
          member: '$members.user',
        },
      },
    ]).exec();
  },

  deleteRoom: function(userId, roomId) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deletedAt: null,
        members: { $elemMatch: { user: userId, role: config.MEMBER_ROLE.ADMIN } },
      },
      { $set: { deletedAt: Date.now() } }
    ).exec();
  },

  getRoomInfoByInvitateCode(invitationCode) {
    return this.findOne({ invitation_code: invitationCode }, 'name avatar');
  },

  addJoinRequest(roomId, userId) {
    return this.updateOne(
      {
        _id: roomId,
      },
      {
        $push: { incoming_requests: userId },
      }
    );
  },

  addNewMember(roomId, userId, lastMsgId) {
    let memberObject = {
      deletedAt: null,
      role: config.MEMBER_ROLE.MEMBER,
      pinned: false,
      user: userId,
      last_message_id: lastMsgId,
    };

    return this.updateOne(
      {
        _id: roomId,
        deletedAt: null,
      },
      {
        $push: { members: memberObject },
      }
    );
  },

  deleteMember: function(memberId, roomId) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deletedAt: null,
        members: { $elemMatch: { user: memberId, deletedAt: null } },
      },
      { $set: { 'members.$.deletedAt': Date.now() } }
    ).exec();
  },

  addMembers({ roomId, users, last_message_id }) {
    var listUsers = [];
    users.map(user => {
      listUsers.push({
        user: user._id,
        role: user.role,
        marked: false,
        deletedAt: null,
        last_message_id: last_message_id,
      });
    });

    return this.update(
      { _id: mongoose.Types.ObjectId(roomId) },
      {
        $push: {
          members: {
            $each: listUsers,
          },
        },
      }
    );
  },

  getInforOfRoom: function(userId, roomId) {
    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      {
        $addFields: {
          members: {
            $filter: {
              input: '$members',
              as: 'member_not_delete',
              cond: { $eq: ['$$member_not_delete.deletedAt', null] },
            },
          },
        },
      },
      {
        $addFields: {
          representative_members: { $slice: ['$members', config.ROOM.LIMIT_REPRESENTATIVE_MEMBER] },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'representative_members.user',
          foreignField: '_id',
          as: 'members_info',
        },
      },
      {
        $addFields: {
          current_user: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$members',
                  as: 'mem',
                  cond: {
                    $and: [
                      { $eq: ['$$mem.deletedAt', null] },
                      { $eq: ['$$mem.user', mongoose.Types.ObjectId(userId)] },
                    ],
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          messages: {
            $filter: {
              input: '$messages',
              as: 'mes',
              cond: { $eq: ['$$mes.deletedAt', null] },
            },
          },
        },
      },
      {
        $addFields: {
          has_unread_msg: {
            $gt: [{ $arrayElemAt: ['$messages._id', -1] }, '$current_user.last_message_id'],
          },
        },
      },
      {
        $project: {
          name: 1,
          desc: 1,
          type: 1,
          avatar: 1,
          invitation_code: 1,
          invitation_type: 1,
          has_unread_msg: 1,
          'members_info._id': 1,
          'members_info.name': 1,
          'members_info.email': 1,
          'members_info.avatar': 1,
          number_of_members: {
            $cond: { if: { type: config.ROOM_TYPE.GROUP_CHAT }, then: { $size: '$members' }, else: 0 },
          },
        },
      },
    ]);
  },

  getRequestJoinRoom: function(roomId, options) {
    let limit = options.limit;
    const page = options.page || 0;

    return this.find(
      {
        _id: roomId,
      },
      { name: 1, incoming_requests: { $slice: [limit * page, limit] } }
    )
      .populate({
        path: 'incoming_requests',
        select: { avatar: 1, name: 1, _id: 1, email: 1 },
      })
      .exec();
  },

  getNumberOfRequest: async function(roomId) {
    const room = await this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId) } },
      {
        $project: {
          number_of_requests: {
            $cond: { if: { $isArray: '$incoming_requests' }, then: { $size: '$incoming_requests' }, else: 0 },
          },
        },
      },
    ]);

    return room[0]['number_of_requests'];
  },

  getRoleOfUser: async function(roomId, userId) {
    const role = await this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      { $unwind: '$members' },
      { $match: { 'members.user': mongoose.Types.ObjectId(userId), 'members.deletedAt': null } },
      {
        $project: {
          'members.role': 1,
          _id: 0,
        },
      },
    ]);

    if (role.length > 0) {
      return role[0].members.role;
    } else {
      return -1;
    }
  },

  rejectRequests: async function(roomId, requestIds) {
    return this.updateOne(
      {
        _id: roomId,
      },
      {
        $pull: {
          incoming_requests: {
            $in: requestIds,
          },
        },
      }
    );
  },

  acceptRequest: async function(roomId, requestIds) {
    let members = [];
    const lastMsgId = await this.getLastMsgId(roomId);

    requestIds.map(id => {
      members.push({
        role: config.MEMBER_ROLE.MEMBER,
        marked: true,
        deletedAt: null,
        user: id,
        last_message_id: lastMsgId,
      });
    });

    return this.update(
      { _id: roomId },
      {
        $push: {
          members: members,
        },
        $pull: {
          incoming_requests: {
            $in: requestIds,
          },
        },
      }
    );
  },

  getLastMsgId: async function(roomId) {
    const room = await this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId) } },
      {
        $addFields: {
          last_message: {
            $slice: ['$messages', -1],
          },
        },
      },
      {
        $project: {
          last_message_id: '$last_message._id',
        },
      },
    ]);

    return room.length ? room[0].last_message_id : null;
  },

  getPinnedRoom: function(roomId, userId) {
    return this.findOne(
      {
        _id: roomId,
        deletedAt: null,
      },
      {
        members: { $elemMatch: { user: { $eq: userId }, deletedAt: null } },
      }
    ).exec();
  },

  getLastMsgIdOfUser: async function(roomId, userId) {
    const room = await this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId) } },
      { $unwind: '$members' },
      { $match: { 'members.deletedAt': null, 'members.user': mongoose.Types.ObjectId(userId) } },
    ]);

    return room.length ? room[0].members.last_message_id : null;
  },

  pinnedRoom: function(roomId, userId, pinned) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deletedAt: null,
        members: { $elemMatch: { user: userId, deletedAt: null } },
      },
      { $set: { 'members.$.pinned': pinned } }
    ).exec();
  },

  loadMessages: async function(roomId, userId, currentMsgId = null, getNextMsgFlag = true) {
    let index = getNextMsgFlag ? 0 : -config.LIMIT_MESSAGE.NEXT_MESSAGE;
    let msgId = currentMsgId;

    if (msgId == null) {
      msgId = await this.getLastMsgIdOfUser(roomId, userId);

      if (msgId == null && getNextMsgFlag == false) {
        return [];
      }
    }

    if (msgId) {
      msgId = mongoose.Types.ObjectId(msgId);
    }

    let filterMsg = { $gt: ['$$mes._id', msgId] };

    if (!getNextMsgFlag) {
      if (currentMsgId) {
        filterMsg = { $lt: ['$$mes._id', msgId] };
      } else {
        filterMsg = { $lte: ['$$mes._id', msgId] };
      }
    }

    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      { $unwind: '$members' },
      { $match: { 'members.user': mongoose.Types.ObjectId(userId), 'members.deletedAt': null } },
      {
        $addFields: {
          messages: {
            $filter: {
              input: '$messages',
              as: 'mes',
              cond: {
                $and: [{ $eq: ['$$mes.deletedAt', null] }, filterMsg],
              },
            },
          },
        },
      },
      {
        $addFields: {
          messages: {
            $slice: ['$messages', index, config.LIMIT_MESSAGE.NEXT_MESSAGE],
          },
        },
      },
      { $unwind: '$messages' },
      {
        $lookup: {
          from: 'users',
          localField: 'messages.user',
          foreignField: '_id',
          as: 'messages.user_info',
        },
      },
      {
        $addFields: {
          'messages.user_info': { $arrayElemAt: ['$messages.user_info', 0] },
        },
      },
      {
        $replaceRoot: { newRoot: '$messages' },
      },
      {
        $project: {
          _id: 1,
          user: 1,
          content: 1,
          createdAt: 1,
          updatedAt: 1,
          'user_info._id': 1,
          'user_info.name': 1,
          'user_info.avatar': 1,
          'user_info.email': 1,
          is_notification: 1,
        },
      },
    ]);
  },

  changeRoleMember: function(roomId, members) {
    return this.findById(roomId).then(function(room) {
      for (let i in members) {
        let index = room.members.findIndex(member => member.user == members[i].memberId);

        if (index !== -1) {
          room.members[index].role = members[i].nextRole;
        }
      }
      room.save();
    });
  },

  deleteMessage: function(messageId, roomId) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deletedAt: null,
        messages: { $elemMatch: { _id: messageId } },
      },
      { $set: { 'messages.$.deletedAt': Date.now() } }
    ).exec();
  },

  storeMessage: async function(roomId, userId, content, isNotification = false) {
    const msgObject = {
      content: content,
      user: userId,
      deletedAt: null,
      is_notification: isNotification,
    };

    return this.findOneAndUpdate(
      { _id: roomId },
      {
        $push: {
          messages: msgObject,
        },
      },
      {
        fields: {
          _id: 1,
          type: 1,
          name: 1,
          avatar: 1,
          messages: { $slice: -1 },
        },
        new: true,
      }
    );
  },

  updateMessage: async function(roomId, userId, msgId, content) {
    return this.updateOne(
      {
        _id: roomId,
        messages: { $elemMatch: { _id: msgId } },
      },
      { $set: { 'messages.$.content': content, updatedAt: Date.now() } }
    );
  },

  getMessageInfo: async function(roomId, messageId) {
    const message = await this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId) } },
      { $unwind: '$messages' },
      { $match: { 'messages._id': mongoose.Types.ObjectId(messageId), 'messages._id.deletedAt': null } },
      {
        $lookup: {
          from: 'users',
          localField: 'messages.user',
          foreignField: '_id',
          as: 'messages.user',
        },
      },

      {
        $addFields: {
          'messages.user_info': {
            $arrayElemAt: ['$messages.user', 0],
          },
        },
      },
      {
        $project: {
          'messages._id': 1,
          'messages.content': 1,
          'messages.createdAt': 1,
          'messages.updatedAt': 1,
          'messages.user_info._id': 1,
          'messages.user_info.name': 1,
          'messages.user_info.avatar': 1,
          'messages.is_notification': 1,
        },
      },
    ]);

    return message.length > 0 ? message[0].messages : {};
  },

  getRoomMyChatId: function(userId) {
    return this.find(
      {
        'members.user': userId,
        type: config.ROOM_TYPE.SELF_CHAT,
      },
      {
        _id: 1,
      }
    ).exec();
  },

  createMyChat: function(userId) {
    return this.insertMany([
      {
        name: 'My Chat',
        type: config.ROOM_TYPE.SELF_CHAT,
        members: [{ user: userId, role: config.MEMBER_ROLE.MEMBER }],
      },
    ]);
  },

  updateLastMessageForMember: function(roomId, userId, messageId) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deleteAt: null,
        members: {
          $elemMatch: {
            user: userId,
            $or: [{ last_message_id: { $lt: messageId } }, { last_message_id: null }],
            deletedAt: null,
          },
        },
      },
      { $set: { 'members.$.last_message_id': messageId } }
    );
  },

  getDirectRoomId: async function(userId, friendId) {
    let type = userId == friendId ? config.ROOM_TYPE.SELF_CHAT : config.ROOM_TYPE.DIRECT_CHAT;

    return this.find(
      {
        type: type,
        deletedAt: null,
        'members.user': userId,
        members: { $elemMatch: { user: [friendId] } },
      },
      { _id: 1 }
    ).exec();
  },

  getDirectRoomInfo: function(userId, acceptUserIds) {
    let memberIds = [];
    acceptUserIds.map(acceptUserId => {
      memberIds.push(mongoose.Types.ObjectId(acceptUserId));
    });

    return this.aggregate([
      {
        $match: {
          deletedAt: null,
          'members.user': mongoose.Types.ObjectId(userId),
          type: config.ROOM_TYPE.DIRECT_CHAT,
        },
      },
      {
        $addFields: {
          receiver: mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'receiver',
          foreignField: '_id',
          as: 'receiver',
        },
      },
      {
        $addFields: {
          receiver: { $arrayElemAt: ['$receiver', 0] },
        },
      },
      { $unwind: '$members' },
      {
        $match: {
          'members.user': { $in: memberIds },
          'members.deletedAt': null,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user',
        },
      },
      {
        $addFields: {
          'members.user': { $arrayElemAt: ['$members.user', 0] },
        },
      },
      {
        $project: {
          sender_id: '$members.user._id',
          receiver_id: '$receiver._id',
          'sender._id': '$_id',
          'sender.name': '$members.user.name',
          'sender.avatar': '$members.user.avatar',
          'sender.email': '$members.user.email',
          'sender.pinned': { $eq: [true, false] },
          'sender.type': '$type',
          'receiver._id': '$_id',
          'receiver.name': 1,
          'receiver.avatar': 1,
          'receiver.email': 1,
          'receiver.pinned': { $eq: [true, false] },
          'receiver.type': '$type',
        },
      },
    ]);
  },

  getNewMemberOfRoom: function(roomId, userIds) {
    let newMemberIds = [];
    userIds.map(userId => {
      newMemberIds.push(mongoose.Types.ObjectId(userId));
    });

    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      {
        $unwind: '$members',
      },
      {
        $match: {
          'members.user': { $in: newMemberIds },
          'members.deletedAt': null,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'members.user',
        },
      },
      {
        $addFields: {
          'members.user': { $arrayElemAt: ['$members.user', 0] },
        },
      },

      {
        $replaceRoot: { newRoot: '$members' },
      },
      {
        $project: {
          _id: 0,
          'user.avatar': 1,
          'user.name': 1,
          'user.email': 1,
          'user.full_address': 1,
          'user.github': 1,
          'user.google': 1,
          'user.phone_number': 1,
          'user.twitter': 1,
          'user._id': 1,
          'user.role': {
            $cond: {
              if: { $eq: ['$role', config.MEMBER_ROLE.ADMIN] },
              then: 'admin',
              else: {
                $cond: {
                  if: { $eq: ['$role', config.MEMBER_ROLE.MEMBER] },
                  then: 'member',
                  else: 'read_only',
                },
              },
            },
          },
        },
      },
    ]);
  },

  getRoomInfoNewMember: function(roomId, userIds = []) {
    let memberConditions = {
      'members.deletedAt': null,
    };

    if (userIds.length) {
      let newMemberIds = [];
      userIds.map(userId => {
        newMemberIds.push(mongoose.Types.ObjectId(userId));
      });

      memberConditions['members.user'] = { $in: newMemberIds };
    }

    return this.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(roomId), deletedAt: null } },
      {
        $unwind: '$members',
      },
      {
        $match: memberConditions,
      },
      {
        $addFields: {
          message_able: {
            $filter: {
              input: '$messages',
              as: 'mes',
              cond: {
                $and: [{ $eq: ['$$mes.deletedAt', null] }, { $gt: ['$$mes._id', '$members.last_message_id'] }],
              },
            },
          },
        },
      },
      {
        $addFields: {
          message_able: { $slice: ['$message_able', -1 * config.LIMIT_MESSAGE.COUNT_UNREAD] },
        },
      },
      {
        $project: {
          avatar: 1,
          name: 1,
          type: 1,
          quantity_unread: { $size: '$message_able' },
          role: 1,
          pinned: '$members.pinned',
          last_created_msg: { $max: '$messages.createdAt' },
          user: '$members.user',
        },
      },
    ]);
  },

  editDescOfRoom: function(roomId, desc) {
    return this.findOneAndUpdate(
      {
        _id: roomId,
        deletedAt: null,
      },
      { $set: { desc: desc } }
    ).exec();
  },

  getAllRoomByUserId: function(userId) {
    return this.aggregate([
      {
        $match: {
          'members.user': mongoose.Types.ObjectId(userId),
          deletedAt: null,
        },
      },
      {
        $unwind: '$members',
      },
      {
        $match: {
          $or: [
            {
              $and: [
                { type: { $ne: config.ROOM_TYPE.SELF_CHAT } },
                { 'members.user': { $ne: mongoose.Types.ObjectId(userId) } },
              ],
            },
            {
              $and: [
                { type: { $eq: config.ROOM_TYPE.SELF_CHAT } },
                { 'members.user': { $eq: mongoose.Types.ObjectId(userId) } },
              ],
            },
          ],
        },
      },
      {
        $project: {
          user_id: '$members.user',
          type: 1,
        },
      },
      {
        $group: {
          _id: '$_id',
          type: { $first: '$type' },
          members: {
            $push: '$user_id',
          },
        },
      },
    ]);
  },

  createTask(roomId, userId, task) {
    let assignees = [];

    for (let i = 0; i < task.assignees.length; i++) {
      assignees.push({
        user: task.assignees[i],
      });
    }

    const taskObj = {
      content: task.content,
      assigner: mongoose.Types.ObjectId(userId),
      start: task.start,
      due: task.due,
      assignees: assignees,
    };

    return this.findOneAndUpdate({ _id: roomId, deleteAt: null }, { $push: { tasks: taskObj } }, { new: true });
  },
};

module.exports = mongoose.model('Room', RoomSchema);
