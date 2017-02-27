// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug').start();
}

import { createServer } from 'http';
import mongoose from 'mongoose';
import Promise from 'bluebird';
import logging from '../lib/logging';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { subscriptionManager } from '../graphql/subscriptions';
import schema from '../graphql/schema';
import config from 'config';


/*
* MONGO DB Connection
*/
Promise.promisifyAll(require("mongoose"));
mongoose.connect(config.mongo_url);
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


const WS_PORT = 8080;

// Create WebSocket listener server
const websocketServer = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});




db.once('open', function() {
  logging.info("Connected to the database");

  // Bind it to port and start listening
  websocketServer.listen(WS_PORT, () => console.log(
    `Websocket Server is now running on http://localhost:${WS_PORT}`
  ));

  startSubscriptionServer(websocketServer);

});





//Function that start to listen to graphql subscriptions
function startSubscriptionServer(server){
  // eslint-disable-next-line
  new SubscriptionServer(
    {
      subscriptionManager,
      onConnect: () => {
        logging.info("Connect");
      },
      onSubscribe: (msg, params) => {
        logging.info("Sub");
        return Object.assign({}, params, {
          context: {}
        });
      }
    },{
      server: server,
      path:"/subscriptions"
    }
  );
}
