import mongoose from 'mongoose';
import { User, Message, Shop, Product, Conversation, Cart, Variant, Order, Ad } from './models';
import { property } from 'lodash';
import GraphQLJSON from 'graphql-type-json';
import _ from 'lodash';
import moment from 'moment';
import Promise from 'bluebird';
import logging from '../lib/logging';

Promise.promisifyAll(require("mongoose"));

export const schema = [`

  scalar JSON

  enum ContentType {
    text
    image
    audio
    video
    file
    location
  }

  type Address {
    streetNumber: String
    route : String
    locality : String
    region: String
    country: String
    postalCode: String
    googleId: String
  }


  # A message sent to or by the page
  type Message {
    id : ID!

    # The facebook id of the message
    mid: String

    # Has been sent by the page or not
    isEcho: Boolean

    # The text of the message
    text: String

    # The type of the message
    type: ContentType

    # The sender (if the client sent the message, otherwise there is a recipient if the message was sent by the page)
    sender: User

    # The recipient (if the page sent the message, otherwise there is a sender if the message was sent by the client)
    recipient: User

    # A timestamp of when the message was sent
    timestamp: Float # Actually a date

    #The url of the content of the message
    fileUrl: String

    #The coordinates if the type of the message is location
    coordinates : JSON

    #Id of the conversation
    conversation: Conversation

    #Attachments
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
    #Ad Source
    adSource: Ad

    createdAt: Float

  }

  # A Conversation between a page and a user
  type Conversation {
    #The conversation id
    id: ID!

    # The user that is concerned by this conversation
    user: User!

    # The number of messages that has been exchanged in this conversation
    nbMessages: Float

    # The number of unread messages
    nbUnreadMessages: Float

    # The messages that has been sent in this conversation
    messages: [Message]

  }

  # A product
  type Product {
    #The product id
    id: ID!

    # The product reference
    reference: String!

    # The title of the product
    title: String

    #The short description of the product
    shortDescription: String

    #The complete description of the product
    longDescription: String

    #The urls of the photos of the product
    categories: [String]

    #The main image of the product
    images: [String]

    #The product price
    price: Float

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
    totalPrice: Float

    shippingAddress : Address
  }

  # The product seelcted by a user in his cart and all the infos attached to it
  type Selection {
    # The product
    variant : Variant!

    #The quantity
    quantity: Float!

    #Total price
    totalPriceVariant: Float
  }

  #The Variants of a product
  type Variant {
    id: ID!

    #The Product
    product: Product!

    #The variance type
    type: String!

    #The value of the variant
    value: String!
  }


  #The Shop
  type Shop {
    id: ID!

    #The email of the shop
    email : String!

    #The name of the shop
    shopName: String!

    #The stripe infos
    stripe: JSON

    #The real url of the shop
    shopUrl: String

    #The facebook page id of the shop
    pageId: String

  }

  #An Order
  type Order {
    id: ID!

    #The Shop cocnerned by the Order
    shop: Shop!

    #The user/customer that did this Order
    user: User!

    #The total amount of the Order
    price: Float!

    #The number of products in the Order
    nbProducts: Float

    #The id of the charge
    chargeId: String!

    # A timestamp of when the customer was charged
    chargeDate: Float # Actually a date

    # The Shipping address
    shippingAddress: Address

    # The billing address
    billingAddress : String

    # The status of the order
    status: String!

    #Date of creation
    createdAt: Float

    #Selection of products
    selections : [Selection]


  }

  #An Ad
  type Ad {
    id: ID!

    #The ad shop
    shop: Shop!

    #The Ad Id
    adId: String

    #A Product associated to the ad
    product: Product

    #New Customers that arrived thanks to this app
    newUsers: Float

    #Amount of all the orders that has been done thanks to customers brought by this ad
    amountOrders: Float

    #Number of orders that has been done thanks to customers brought by this ad
    nbOrders: Float

  }

`];


export const resolvers = {
  Message: {
    id: property("_id"),
    timestamp({timestamp}, _, context) {
      return moment(timestamp).valueOf();
    },
    sender({ sender }, _, context) {
      return User.findById(sender);
    },
    recipient({ recipient }, _, context) {
      return User.findById(recipient);
    },
    conversation({ conversation }, _, context) {
      return Conversation.findById(conversation);
    }
  },
  Conversation: {
    id: property("_id"),
    user({user}, _, context) {
      return User.findById(user);
    },
    messages(obj, args, context){
      return Message.find({conversation : obj._id});
    }
  },
  Cart: {
    id: property("_id"),
    user({user}, _, context) {
      return User.findById(user);
    },
    selections(obj, args, context){
      return obj.selections;
    }
  },
  Selection: {
    variant({variant}, _, context) {
      return Variant.findById(variant);
    }
  },
  Variant: {
    product({product}, _, context) {
      return Product.findById(product);
    }
  },
  Order: {
    user({user}, _, context){
      return User.findById(user);
    },
    shop({shop}, _, context){
      return Shop.findById(shop);
    }
  },
  Ad: {
    shop({shop}, _, context){
      return Shop.findById(shop);
    },
    product({product}, _, context){
      return Product.findById(product);
    }
  },
  JSON: GraphQLJSON,
};
