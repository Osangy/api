import { schema as mongoSchema, resolvers as mongoResolvers } from '../mongo/schema';
import { makeExecutableSchema } from 'graphql-tools';
import { merge, reverse } from 'lodash';
import { User, Message, Conversation, Cart, Product, Variant, Shop, Order } from '../mongo/models';
import facebook from '../utils/facebookUtils';
import shop from '../utils/shop';
import logging from '../lib/logging';
import Promise from 'bluebird';
import moment from 'moment';

Promise.promisifyAll(require("mongoose"));

const rootSchema = [`
  enum StatusOrder {
    PAID
    SENT
    DELIVERED
  }

  input SelectionInput {
    # The product
    variant : ID!

    #The quantity
    quantity: Float!
  }

  type ShopErrorResponse {
    shop: Shop,
    errors: [String]
  }

  type Query {
    # A list of message
    messages(limit:Int!, conversationId: String!, offset:Float!) : [Message]

    # The list of conversations of a page_id
    conversation(limit: Int = 10): [Conversation]

    # The information about a user
    user(facebookId: String!): User

    # The products of a shop
    products(limit: Int = 10): [Product]

    #The variants of a product
    variants(product : ID!): [Variant]

    # The cart of a user
    cart(userId: ID!): Cart

    # The orders of a shop
    orders(limit : Int = 30): [Order]
  }

  type Mutation {

    # A page send a message to a user
    sendMessage(text: String!, facebookId: String!): Message

    # A page send a message to a user
    sendImage(url: String!, facebookId: String!): Message

    # Add a product to the cart
    addCart(userId: String!, variantId: String!): Cart

    # Update the cart
    updateCart(userId: ID!, selections: [SelectionInput]!): Cart

    # Connect to Stripe accounts
    stripeConnect(authorizationCode: String!): ShopErrorResponse

    # Send test button to webview
    payCart(cartId: ID!): Boolean

    # Create a fake Cart
    createFakeCart(userId:ID!, price: Float): Cart

    # Update status of an orders
    updateStatusOrder(orderId: ID!, newStatus: StatusOrder!): Order

    #Set messages of a conversation as read
    setMessagesAsRead(conversationId: ID!): Conversation

  }

  type Subscription {
    # Subscription fires on new message
    messageAdded(shopId: ID!): Message

    # Subscription fires when cart has been modified
    cartModified(shopId: ID!): Cart
  }

  schema {
    query: Query
    mutation: Mutation
    subscription: Subscription
  }
`];


const rootResolvers = {
  Query: {
    messages(root, {limit, conversationId, offset}, context) {
      logging.info("Querying Messages");
      const limitValidator = (limit > 100) ? 100 : limit;
      let messsagesToReturn;
      const offsetDate = (moment.unix(offset)).toDate();
      return Promise.resolve()
        .then(() => (
           Message.find({conversation: conversationId, timestamp:{"$lt" : offsetDate}}).sort({timestamp : -1}).populate("conversation").limit(limit)
        ))
        .then((messages) => {
          messsagesToReturn = reverse(messages);
          if(messages){
            let conversation = messages[0].conversation;
            conversation.nbUnreadMessages = 0;
            return conversation.save();
          }
          else{
            return messsagesToReturn;
          }
        })
        .then((conversation) =>(
          messsagesToReturn
        ))
    },
    conversation(root, { limit }, context){
      logging.info("Querying Conversations");
      const limitValidator = (limit > 20) ? 10 : limit;
      return Conversation.find({ shop: context.user._id}).limit(limit);
    },
    user(root, { facebookId }, context){
      logging.info("Querying User");
      return User.findOne({ facebook_id: facebookId });
    },
    products(root, { limit }, context){
      logging.info("Querying products");
      const limitValidator = (limit > 20) ? 20 : limit;
      return Product.find({ shop: context.user._id}).limit(limit);
    },
    variants(root, { product }, context){
      logging.info("Querying Variants");
      return Variant.find({ product: product}).limit(20);
    },
    cart(root, { userId }, context){
      logging.info("Querying Cart");
      return Cart.findOne({user: userId});
    },
    orders(root, {limit}, context){
      logging.info("Querying Orders");
      return Order.find({shop : context.user}).sort({createdAt : -1}).limit(limit);
    }
  },
  Mutation : {
    sendMessage(root, {text, facebookId}, context){
      logging.info(`Mutation : An agent send : ${text} / to facebook Id : ${facebookId}`);
      return Promise.resolve()
        .then(() => (
           facebook.sendMessage(context.user, facebookId, text)
        ))
        .then((message) => (
          message
        ));
    },
    sendImage(root, {url, facebookId}, context){
      logging.info("Mutation : Send an Image");
      return Promise.resolve()
        .then(() => (
           facebook.sendImage(context.user, facebookId, url)
        ))
        .then((message) => (
          message
        ));
    },
    addCart(root, {userId, variantId}, context){
      logging.info("Mutation : Add Cart");
      return Promise.resolve()
        .then(() => (
           Cart.addProduct(variantId, context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    updateCart(root, {userId, selections}, context){
      logging.info("Mutation : Update Cart");
      return Promise.resolve()
        .then(() => (
           Cart.updateCart(selections, context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    stripeConnect(root, {authorizationCode}, context){
      logging.info("Mutation : Stripe Connect");
      return new Promise((resolve, reject) => {

        context.user.getStripeToken(authorizationCode).then((shop) => {
          resolve({
            shop: shop,
            errors: null
          });
        }).catch((err) => {
          console.log(err.message);
          resolve({
            shop: null,
            errors: [err.message]
          })
        });

      });
    },
    payCart(root, { cartId }, context){
      logging.info("Mutation : Pay Cart");
      return Promise.resolve()
        .then(() => (
           shop.payCart(context.user, cartId)
        ))
        .then((parsedBody) => (
          true
        ));
    },
    createFakeCart(root, { userId, price }, context){
      return Promise.resolve()
        .then(() => (
           Cart.createFakeCart(context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    updateStatusOrder(root, {orderId, newStatus}, context){
      return Promise.resolve()
        .then(() => {
          console.log(orderId);
          return Order.findById(orderId).populate("shop user");
        })
        .then((order) => (
          order.updateStatus(newStatus)
        ))
        .then((order) => {
          console.log(order._id);
          return order;
        });
    },
    setMessagesAsRead(root, {conversationId}, context){
      return Promise.resolve()
        .then(() => {
          return Conversation.findById(conversationId)
        })
        .then((conversation) => {
          conversation.nbUnreadMessages = 0;
          return conversation.save();
        })
        .then((conversation) => {
          return conversation
        });
    }
  },
  Subscription: {
    messageAdded(message) {
      return message;
    },
    cartModified(cart) {
      return cart;
    },
  },
};


// Put schema together into one array of schema strings
// and one map of resolvers, like makeExecutableSchema expects
const schema = [...rootSchema, ...mongoSchema];
const resolvers = merge(rootResolvers, mongoResolvers);

const executableSchema = makeExecutableSchema({
  typeDefs: schema,
  resolvers,
});

export default executableSchema;
