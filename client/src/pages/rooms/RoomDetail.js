import React from 'react';
import 'antd/dist/antd.css';
import { Layout, Typography, Row, Col, message, Button, Modal, Input, Icon } from 'antd';
import { withNamespaces } from 'react-i18next';
import { withRouter } from 'react-router';
import { getInforRoom, getMembersOfRoom } from '../../api/room';
import ChatBox from '../../components/room/ChatBox';
import HeaderOfRoom from '../../components/room/HeaderOfRoom';
import TasksOfRoom from '../../components/room/TasksOfRoom';
import { SocketContext } from './../../context/SocketContext';
import { withUserContext } from './../../context/withUserContext';
import ModalEditDesc from '../../components/room/ModalEditDesc';
import ModalCreateTask from '../../components/room/ModalCreateTask';
import { room } from '../../config/room';
import { Resizable } from 're-resizable';
import { saveSizeComponentsChat } from '../../helpers/common';

const { Sider, Content } = Layout;
const { Text } = Typography;

class RoomDetail extends React.Component {
  static contextType = SocketContext;

  state = {
    isAdmin: false,
    isReadOnly: false,
    roomId: '',
    roomInfo: '',
    lastMsgId: '',
    isCopy: false,
    members: [],
    loadedRoomInfo: false,
  };

  showModal = () => {
    this.setState({
      visible: true,
    });
  };

  handleOk = e => {
    this.setState({
      visible: false,
    });
  };

  handleCancel = e => {
    this.setState({
      visible: false,
    });
  };

  handleCopyInvitationLink = e => {
    var copyText = document.getElementById('url-invitation');
    copyText.select();
    document.execCommand('copy');

    this.setState({
      isCopy: true,
    });
  };

  fetchData = roomId => {
    getInforRoom(roomId)
      .then(res => {
        this.setState({
          roomInfo: res.data.roomInfo,
          isAdmin: res.data.isAdmin,
          lastMsgId: res.data.lastMsgId,
          isReadOnly: res.data.isReadOnly,
          loadedRoomInfo: true,
        });

        this.context.socket.emit('open_room', roomId);
      })
      .catch(error => {
        this.props.history.push(`/rooms/${this.props.userContext.my_chat_id}`);
        message.error(this.props.t('room_not_exist'));
      });
  };

  getAllMembersOfRoom = roomId => {
    getMembersOfRoom(roomId).then(res => {
      this.setState({
        members: res.data.results.members,
      });
    });
  };

  componentDidMount() {
    let descDOM = document.getElementsByClassName('description-chat')[0];

    if (descDOM) {
      descDOM.style.removeProperty('width');
      descDOM.style.removeProperty('min-width');
      descDOM.style.removeProperty('max-width');
    }

    const roomId = this.props.match.params.id;
    const { socket } = this.context;

    this.fetchData(roomId);
    this.getAllMembersOfRoom(roomId);

    socket.on('edit_room_successfully', roomInfo => {
      this.setState({ roomInfo });
    });

    socket.on('create_room_success', roomId => {
      this.props.history.push(`/rooms/${roomId}`);
    });

    socket.on('edit_desc_of_room_successfully', descOfRoom => {
      this.setState(prevState => ({
        roomInfo: {
          ...prevState.roomInfo,
          desc: descOfRoom,
        },
      }));
    });

    socket.on('update_direct_room_info', res => {
      if (this.state.roomInfo._id === res._id) {
        this.setState({
          roomInfo: {
            ...this.state.roomInfo,
            name: res.name,
            avatar: res.avatar !== undefined ? res.avatar : this.state.roomInfo.avatar,
          },
        });
      }
    });

    //Listen 'update_member_info' event from server
    socket.on('update_member_info', res => {
      const { members } = this.state;
      let index = members.findIndex(member => member._id == res._id);
      members[index] = { ...members[index], ...res };

      this.setState(prevState => ({
        roomInfo: {
          ...prevState.roomInfo,
          members_info: prevState.roomInfo.members_info.map(member =>
            member._id === res._id
              ? {
                  ...member,
                  name: res.name,
                  avatar: res.avatar,
                }
              : member
          ),
          members,
        },
      }));
    });
  }

  componentWillReceiveProps(nextProps) {
    const roomId = nextProps.match.params.id;

    if (this.props.match.params.id !== roomId) {
      this.setState({ loadedRoomInfo: false });
      this.fetchData(roomId);
      this.getAllMembersOfRoom(roomId);
    }
  }

  setWidthChatBox = () => {
    saveSizeComponentsChat();
  };

  render() {
    const { t } = this.props;
    const { roomInfo, isAdmin, isCopy, lastMsgId, isReadOnly, members, loadedRoomInfo } = this.state;
    const invitationURL = `${room.INVITATION_URL}${roomInfo.invitation_code}`;
    const roomId = this.props.match.params.id;
    const minW = room.MIN_WIDTH_DESC * window.innerWidth;
    const maxW = room.MAX_WIDTH_DESC * window.innerWidth;

    return (
      <React.Fragment>
        <Layout>
          <HeaderOfRoom data={roomInfo} isAdmin={isAdmin} />
          <Layout>
            <ChatBox
              roomId={roomId}
              lastMsgId={lastMsgId}
              isReadOnly={isReadOnly}
              allMembers={members}
              roomInfo={roomInfo}
              loadedRoomInfo={loadedRoomInfo}
            />
            <Resizable
              enable={{ left: true }}
              minWidth={minW}
              maxWidth={maxW}
              onResizeStop={this.setWidthChatBox}
              defaultSize={{ width: localStorage.getItem('descW') ? localStorage.getItem('descW') : (minW + maxW) / 2 }}
            >
              <Sider
                className="description-chat"
                width={localStorage.getItem('descW') ? localStorage.getItem('descW') : (minW + maxW) / 2}
              >
                <Row type="flex" justify="start" className="title-desc-chat-room">
                  <Col span={24}>
                    <Text strong> {t('title.room_des')} </Text>
                    {(roomInfo.type === room.ROOM_TYPE.DIRECT_CHAT ||
                      roomInfo.type === room.ROOM_TYPE.MY_CHAT ||
                      (roomInfo.type == room.ROOM_TYPE.GROUP_CHAT && isAdmin)) && (
                      <ModalEditDesc roomDesc={roomInfo.desc} roomId={roomId} />
                    )}
                    <Modal
                      title="Invitation Link"
                      visible={this.state.visible}
                      onOk={this.handleOk}
                      onCancel={this.handleCancel}
                      footer={[
                        <Button key="back" onClick={this.handleCancel}>
                          {t('button.back')}
                        </Button>,
                      ]}
                    >
                      <p> {t('invitation.description')} </p>
                      <Input placeholder="Basic usage" value={invitationURL} id="url-invitation" />
                      <Button type="primary" onClick={this.handleCopyInvitationLink} className="copy-btn">
                        {isCopy ? t('button.copied') : t('button.copy')}
                      </Button>
                    </Modal>
                  </Col>
                </Row>
                <div className="content-desc-chat-room">
                  {roomInfo.desc ? roomInfo.desc : <div className="no-description">No description</div>}
                </div>
                {roomInfo.type == room.ROOM_TYPE.GROUP_CHAT ? (
                  <div>
                    <Button type="primary" block onClick={this.showModal} className="invitation-btn">
                      {t('invitation.title')}
                    </Button>
                    <ModalCreateTask members={roomInfo.members_info} roomId={roomId} />
                  </div>
                ) : (
                  ''
                )}
                <TasksOfRoom />
              </Sider>
            </Resizable>
          </Layout>
        </Layout>
      </React.Fragment>
    );
  }
}

export default withRouter(withNamespaces(['room'])(withUserContext(RoomDetail)));
