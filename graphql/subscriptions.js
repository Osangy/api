import { SubscriptionManager } from 'graphql-subscriptions';
import schema from './schema';
import { RedisPubSub } from 'graphql-redis-subscriptions';

const pubsub = new RedisPubSub({
  connection: {
    host: "redis-19256.c3.eu-west-1-2.ec2.cloud.redislabs.com",
    port: "19256",
    retry_strategy: options => {
      // reconnect after
      return Math.max(options.attempt * 100, 3000);
    }
  }
});

// PubSub can be easily replaced, for example with https://github.com/davidyaha/graphql-redis-subscriptions
//const pubsub = new PubSub();


const subscriptionManager = new SubscriptionManager({
  schema : schema,
  pubsub,

  // setupFunctions maps from subscription name to a map of channel names and their filter functions
  // in this case it will subscribe to the commentAddedChannel and re-run the subscription query
  // every time a new comment is posted whose repository name matches args.repoFullName.
  setupFunctions: {
    messageAdded: (options, args) => ({
      messageAdded: message => message.conversation._id === args.conversationId,
    }),
  },
});


export { subscriptionManager, pubsub};
