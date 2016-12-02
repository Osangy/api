import { find, filter } from 'lodash';

const users = [
  {username: 'Adrien'},
  {username: 'Paul'},
];

const messages = [
  { text: "Coucou", username:"Adrien", sentAt: 1234},
  { text: "Ca va ?", username:"Paul", sentAt: 1234},
  { text: "Oui et toi ?", username:"Adrien", sentAt: 1234},
];

const resolveFunctions = {
  Query: {
    messages() {
      return messages;
    },
  },
  Mutation: {
    postMessage(_, { text }) {
      let message = {text: text, username:'Adrien', sentAt:321}
      messages.push(message);
      return message;
    },
  },
  Message: {
    user(message) {
      return find(users, { username: message.username });
    },
  },
};

export default resolveFunctions;
