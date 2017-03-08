// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug').start();
}

import https from 'https';
import mongoose from 'mongoose';
import Promise from 'bluebird';
import logging from '../lib/logging';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { subscriptionManager } from '../graphql/subscriptions';
import schema from '../graphql/schema';
import config from 'config';
import fs from 'fs';
import express from 'express';
import {Server} from 'ws';


/*
* SSL Certificate
*/

const privateKey  = fs.readFileSync('socket/sslcert/key.pem', 'utf8');
const certificate = fs.readFileSync('socket/sslcert/cert.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

let app = express();

/*
* MONGO DB Connection
*/
Promise.promisifyAll(require("mongoose"));
mongoose.connect(config.mongo_url);
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


const WS_PORT = 8443;

// Create WebSocket listener server
let httpsServer = https.createServer(credentials, app);

app.get('/', (req, res) => {
  res.status(200).send('ok');
});


db.once('open', function() {
  logging.info("Connected to the database");

  // Bind it to port and start listening
  httpsServer.listen(WS_PORT, () => console.log(
    `Websocket Server is now running on https://localhost:${WS_PORT}`
  ));
  var wss = new Server({ server: httpsServer });

  wss.on('connection', function (wsConnect) {
    wsConnect.on('message', function (message) {
      console.log(message);
    });
    wsConnect.send('something');
  });

  startSubscriptionServer(wss);

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
