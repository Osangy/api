import { schema as mongoSchema, resolvers as mongoResolvers } from './mongo/schema';
import { makeExecutableSchema } from 'graphql-tools';
import { merge, reverse } from 'lodash';
import { User, Message, Conversation, Cart, Product } from './mongo/models';
import * as facebook from './utils/facebookUtils';

const rootSchema = [`
  # A list of options for the sort order of the feed

  input SelectionInput {
    # The product
    product : ID!

    #The quantity
    quantity: Float!
  }

  type Query {
    # A list of message
    message(limit: Int = 30, conversationId: String!) : [Message]

    # The list of conversations of a page_id
    conversation(limit: Int = 10): [Conversation]

    # The information about a user
    user(facebookId: String!): User

    # The products of a shop
    products(limit: Int = 10): [Product]

    # The cart of a user
    cart(userId: ID!): Cart
  }

  type Mutation {

    # A page send a message to a user
    sendMessage(text: String!, facebookId: String!): String

    # A page send a message to a user
    sendImage(url: String!, facebookId: String!): String

    # Add a product to the cart
    addCart(userId: String!, productId: String!): Cart

    # Update the cart
    updateCart(userId: ID!, selections: [SelectionInput]!): Cart

  }

  schema {
    query: Query
    mutation: Mutation
  }
`];


const rootResolvers = {
  Query: {
    message(root, {limit, conversationId}, context) {
      const limitValidator = (limit > 30) ? 30 : limit;

      return Promise.resolve()
        .then(() => (
           Message.find({conversation: conversationId}).sort({timestamp : -1}).limit(limit)
        ))
        .then((messages) => (
          reverse(messages)
        ));
    },
    conversation(root, { limit }, context){
      const limitValidator = (limit > 20) ? 10 : limit;
      return Conversation.find({ shop: context.user._id}).limit(limit);
    },
    user(root, { facebookId }, context){
      return User.findOne({ facebook_id: facebookId });
    },
    products(root, { limit }, context){
      const limitValidator = (limit > 20) ? 20 : limit;
      return Product.find({ shop: context.user._id}).limit(limit);
    },
    cart(root, { userId }, context){
      return Cart.findOne({user: userId});
    }
  },
  Mutation : {
    sendMessage(root, {text, facebookId}, context){
      console.log(`Just received text : ${text} / And facebook Id : ${facebookId}`);
      return Promise.resolve()
        .then(() => (
           facebook.sendMessage(context.user, facebookId, text)
        ))
        .then((body) => (
          JSON.stringify(body)
        ));
    },
    sendImage(root, {url, facebookId}, context){
      return Promise.resolve()
        .then(() => (
           facebook.sendImage(context.user, facebookId, url)
        ))
        .then((body) => (
          JSON.stringify(body)
        ));
    },
    addCart(root, {userId, productId}, context){
      return Promise.resolve()
        .then(() => (
           Cart.addProduct(productId, context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    updateCart(root, {userId, selections}, context){
      return Promise.resolve()
        .then(() => (
           Cart.updateCart(selections, context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
  }
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
