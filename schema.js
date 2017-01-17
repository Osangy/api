import { schema as mongoSchema, resolvers as mongoResolvers } from './mongo/schema';
import { makeExecutableSchema } from 'graphql-tools';
import { merge, reverse } from 'lodash';
import { User, Message, Conversation } from './mongo/model';
import * as facebook from './utils/facebookUtils';

const rootSchema = [`
  # A list of options for the sort order of the feed

  type Query {
    # A list of message
    message(limit: Int = 30, conversationId: String!) : [Message]

    # The list of conversations of a page_id
    conversation(limit: Int = 10): [Conversation]

    # The information about a user
    user(facebookId: String!): User
  }

  type Mutation {

    # A page send a message to a user
    sendMessage(text: String!, facebookId: String!): String

  }

  schema {
    query: Query
    mutation: Mutation
  }
`];


const rootResolvers = {
  Query: {
    message(root, {limit, conversationId}, context) {
      console.log("Context ", context.user);
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
      console.log(context.user);
      const limitValidator = (limit > 20) ? 10 : limit;
      return Conversation.find({ shop: context.user._id}).limit(limit);
    },
    user(root, { facebookId }, context){
      return User.findOne({ facebook_id: facebookId });
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
    }
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
