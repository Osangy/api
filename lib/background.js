import Pubsub from '@google-cloud/pubsub';
import logging from './logging';
import config from 'config';

const topicName = config.TOPIC_NAME;
const subscriptionName = config.SUBSCRIPTION_NAME;

const pubsub = Pubsub({
  projectId: config.GCLOUD_PROJECT
});

// This configuration will automatically create the topic if
// it doesn't yet exist. Usually, you'll want to make sure
// that a least one subscription exists on the topic before
// publishing anything to it as topics without subscribers
// will essentially drop any messages.
// [START topic]
function getTopic (cb) {
  pubsub.createTopic(topicName, (err, topic) => {
    // topic already exists.
    if (err && err.code === 409) {
      logging.info(`Topic name ${topicName}`)
      cb(null, pubsub.topic(topicName));
      return;
    }
    logging.info(`Topic name ${topicName}`)
    cb(err, topic);
    return;
  });
}
// [END topic]

// Used by the worker to listen to pubsub messages.
// When more than one worker is running they will all share the same
// subscription, which means that pub/sub will evenly distribute messages
// to each worker.
// [START subscribe]
function subscribe (cb) {
  let subscription;

  // Event handlers
  function handleMessage (message) {
    cb(null, message.data);
  }
  function handleError (err) {
    logging.error(err);
  }

  getTopic((err, topic) => {
    if (err) {
      cb(err);
      return;
    }

    topic.subscribe(subscriptionName, {
      autoAck: true
    }, (err, sub) => {
      if (err) {
        cb(err);
        return;
      }

      subscription = sub;

      // Listen to and handle message and error events
      subscription.on('message', handleMessage);
      subscription.on('error', handleError);

      logging.info(`Listening to ${topicName} with subscription ${subscriptionName}`);
    });
  });

  // Subscription cancellation function
  return () => {
    if (subscription) {
      // Remove event listeners
      subscription.removeListener('message', handleMessage);
      subscription.removeListener('error', handleError);
      subscription = undefined;
    }
  };
}
// [END subscribe]


// Adds a book to the queue to be processed by the worker.
// [START queue]
function queueEntry (entryData) {
  getTopic((err, topic) => {
    if (err) {
      logging.error('Error occurred while getting pubsub topic', err);
      return;
    }

    topic.publish({
      entry : entryData
    }, (err) => {
      if (err) {
        logging.error('Error occurred while queuing background task', err);
      } else {
        logging.info(`Entry at time ${entryData.time} queued for background processing`);
      }
    });
  });
}

function queueFile(fileUrl, mid) {
  getTopic((err, topic) => {
    if (err) {
      logging.error('Error occurred while getting pubsub topic', err);
      return;
    }

    topic.publish({
      fileUrl : fileUrl,
      mid: mid
    }, (err) => {
      if (err) {
        logging.error('Error occurred while queuing background task', err);
      } else {
        logging.info(`File of message ${mid} queued for background processing`);
      }
    });
  });
}


function queuePaidCart(cartId) {
  getTopic((err, topic) => {
    if (err) {
      logging.error('Error occurred while getting pubsub topic', err);
      return;
    }

    topic.publish({
      cartId : cartId
    }, (err) => {
      if (err) {
        logging.error('Error occurred while queuing background task', err);
      } else {
        logging.info(`Paid cart with id ${cartId} queued for background processing`);
      }
    });
  });
}

// [END queue]

module.exports = {
  subscribe,
  queueEntry,
  queueFile,
  queuePaidCart
};
