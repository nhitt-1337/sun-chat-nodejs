import Http from './../utils/Http';

export function createTask(roomId, data) {
  return new Http().authenticated().post(`/rooms/${roomId}/tasks`, data);
}

export function getTasksOfRoom(roomId, type) {
  return new Http().authenticated().get(`/rooms/${roomId}/tasks?type=${type}`);
}
