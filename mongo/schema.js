import { User, Message, Conversation, Product, Cart } from './model';
import { property } from 'lodash';
import GraphQLJSON from 'graphql-type-json';
import _ from 'lodash';

export const schema = [`

  scalar JSON

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
    timestamp: Float # Actually a date
    # The attachment of the message if there was one
    attachments: [JSON]
  }

  # A user
  type User {
    #The user id
    id: ID!
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
    #The conversation id
    id: ID!

    # The user that is concerned by this conversation
    user: User!

    # The number of messages that has been exchanged in this conversation
    nbMessages: Float

    # The messages that has been sent in this conversation
    messages: [Message]

  }

  # A product
  type Product {
    #The product id
    id: ID!

    # The product id of the shop store
    product_id: String!

    # The name of the product
    name: String

    # The price of the product
    price: Float

    #The short description of the product
    short_description: String

    #The complete description of the product
    description: String

    #The urls of the photos of the product
    photos_urls: [String]

  }
  # The cart of a user
  type Cart {
    #The cart id
    id: ID!

    # The user associated with the cart
    user: User!

    #The number of products in the cart
    nbProducts: Float

    # The selection of products that the user added to his cart
    selections: [Selection]

    #The total price of the cart
    totalPrice: Float!
  }

  # The product seelcted by a user in his cart and all the infos attached to it
  type Selection {
    # The product
    product : Product!

    #The quantity
    quantity: Float!

    #Total price
    totalPriceProduct: Float!
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
    user({user}, _, context) {
      return User.findOne({_id : user});
    },
    nbMessages: property("nb_messages"),
    messages(obj, args, context){
      return Message.find({conversation : obj._id});
    }
  },
  Cart: {
    user({user}, _, context) {
      return User.findOne({_id : user});
    },
    selections(obj, args, context){
      return obj.selections;
    }
  },
  Selection: {
    product({product}, _, context) {
      return Product.findById(product);
    }
  },
  JSON: GraphQLJSON,
};
