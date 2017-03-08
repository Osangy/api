// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug');
}

import request from 'request';
import Promise from 'bluebird';
import express from 'express';
import mongoose from 'mongoose';
import config from 'config';
import url from 'url';
import _ from 'lodash';

import background from '../lib/background'
import logging from '../lib/logging';
import facebook from '../utils/facebookUtils';
import files from '../lib/files';
import { Message } from '../mongo/models';
import shop from '../utils/shop';


/*
* MONGO DB Connection
*/
Promise.promisifyAll(require("mongoose"));
mongoose.connect(config.mongo_url);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


// When running on Google App Engine Managed VMs, the worker needs
// to respond to HTTP requests and can optionally supply a health check.
// [START server]
const app = express();

app.set('port', (process.env.PORT || 8081));

app.get('/_ah/health', (req, res) => {
  res.status(200).send('ok');
});

app.use(logging.requestLogger);

app.get('/', (req, res) => {
  res.send(`This worker has processed nothing`);
});

app.use(logging.errorLogger);


db.once('open', function() {
  logging.info("Connected to the database");

  const server = app.listen(app.get('port'),() => logging.info(
    `Worker running on port ${app.get('port')}`
  ));

  subscribe();
});


// [END server]


function subscribe () {
  // Subscribe to Cloud Pub/Sub and receive messages to process messages.
  // The subscription will continue to listen for messages until the process
  // is killed.
  // [START subscribe]
  const unsubscribeFn = background.subscribe((err, message) => {
    logging.info(message);
    // Any errors received are considered fatal.
    if (err) {
      logging.error(err);
      throw err;
    }

    if(message.entry){
      logging.info(`Received request to process entry of time ${message.entry.time}`);

      facebook.manageEntry(message.entry).then(() => {
        logging.info("Finished managing an entry with success");
      }).catch((err) => {
        logging.error(err);
      })
    }
    //Upload a file
    else if(message.fileUrl){
      logging.info(`Received request to process file of message ${message.mid}`);
      const pathname = url.parse(message.fileUrl).pathname;
      const paths = _.split(pathname, '/');
      const imageName = _.last(paths);
      logging.info(imageName);
      files.downloadAndUploadImage(message.fileUrl, imageName, (err, publicUrl) => {
        console.log(publicUrl);
        //TODO : update the file url of the message
        Message.findOne({mid : message.mid}).then((messageObject) => {
          if(messageObject){
            messageObject.fileUrl = publicUrl
            messageObject.save().then((message) => {
              logging.info("message updated with new url");
            })
          }
        });
      });
    }
    //Manage creation of an order, empty a cart, and update a charge
    else if(message.cartId){
      logging.info(`Received request to process paid cart ${message.cartId}`);
      shop.processPaidCart(message.cartId).then((order) => {
        logging.info(`New order created ${order._id}`)
      }).catch((err) => {
        logging.error(err.message);
      })
    }
    else{
      logging.warn("We don't know this message");
    }


  });
  // [END subscribe]
  return unsubscribeFn;
}
