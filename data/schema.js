import { makeExecutableSchema } from 'graphql-tools';

import resolvers from './resolvers';

const schema = `
type Message {
  #The text of the message
  text:String!

  #The username of the user that sent the message
  user: User!

  #The date when the message was sent
  sentAt: Float!
}

type User {
  #The user usernma
  username: String!
}

# the schema allows the following query:
type Query {
  messages: [Message]
}

# this schema allows the following mutation:
type Mutation {
  postMessage (
    text: String!
  ): Message
}
`;

export default makeExecutableSchema({
  typeDefs: schema,
  resolvers,
});
