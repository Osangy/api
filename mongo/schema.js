import { User, Message, Conversation } from './model';
import { property } from 'lodash';

export const schema = [`

  # A message sent to or by the page
  type Message {
    # The facebook id of the message
    mid: String!
    # The seq number of the facebook conversation
    seq: Int!
    # Has been sent by the page or not
    isEcho: Boolean
    # The text of the message
    text: String
    # The sender (if the client sent the message, otherwise there is a recipient if the message was sent by the page)
    sender: User
    # The recipient (if the page sent the message, otherwise there is a sender if the message was sent by the client)
    recipient: User
    # A timestamp of when the message was sent
    timestamp: Float! # Actually a date
    # The attachment of the message if there was one
    attachments: [String]
  }

  # A user
  type User {
    # The facebook id of the user
    facebookId: String
    # The first name of the user
    firstName: String
    # The last name of the user
    lastName: String
    # The profile picture (url) of the user
    profilePic: String
    # The locale info of the user provided by Facebook
    locale: String
    # The timezone of the user provided by facebook
    timezone: Float
    # The gender of the user
    gender: String

  }

  # A Conversation between a page and a user
  type Conversation {
    # The id of the page that is concerned by this conversation
    pageId: String!

    # The user that is concerned by this conversation
    user: User!

    # The number of messages that has been exchanged in this conversation
    nbMessages: Float

    # The messages that has been sent in this conversation
    messages: [Message]

  }
`];


export const resolvers = {
  Message: {
    sender({ sender }, _, context) {
      return User.findOne({ _id : sender});
    },
    recipient({ recipient }, _, context) {
      return User.findOne({ _id : recipient});
    },
    isEcho: property("is_echo")
  },
  User: {
    facebookId(obj){
      return obj.facebook_id
    },
    firstName: property('first_name'),
    lastName: property('last_name'),
    profilePic: property('profile_pic')
  },
  Conversation: {
    pageId: property("page_id"),
    user({user}, _, context) {
      return User.findOne({_id : user});
    },
    nbMessages: property("nb_messages"),
    messages(obj, args, context){
      return Message.find({conversation : obj._id});
    }
  },
};
