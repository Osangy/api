import redis from 'redis';
import Promise from 'bluebird';
import logging from '../lib/logging';

Promise.promisifyAll(require("mongoose"));

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

let client;


function getClient(){
  if(!client){
    logging.info("NEED TO INIT REDIS")
    initClient();
  }
  return client;
}

function initClient(){
  client = redis.createClient({
    url: "redis://redis-19256.c3.eu-west-1-2.ec2.cloud.redislabs.com:19256"
  });

  client.on("connect", () => {
    logging.info("Redis connected");
  });
}



/* REDIS FUNCTIONS TO MANAGES MESSAGES */

function saveMessage(messageObject){

  return new Promise((resolve, reject) => {
    const listName = `messages:user:${messageObject.recipient.id}:page:${messageObject.sender.id}`;
    const shopKeyName = `customerswaiting:page:${messageObject.sender.id}`;

    getClient().rpushAsync(listName, JSON.stringify(messageObject)).then((len) => {
      logging.info(`${len} messages saved for a waiting user not yet authorized for page ${messageObject.sender.id}`);
      if(len === 1){
        getClient().incrAsync(shopKeyName).then((len) => {
          logging.info(`(INCR) ${len} users waiting to do an action for the shop page id ${messageObject.sender.id}`);
          resolve();
        }).catch((err) => {
          reject(err);
        })
      }
      else resolve();

    }).catch((err) => {
      reject(err);
    })

  });

}

function retrieveMessages(userId, pageId){

  return new Promise((resolve, reject) => {

    const listName = `messages:user:${userId}:page:${pageId}`;
    logging.info(listName);

    getClient().lrangeAsync(listName, 0, -1).then((messages) => {
      logging.info(messages);
      resolve(messages);
    }).catch((err) => {
      reject(err);
    });

  });

}

function deleteMessages(userId, pageId){
  return new Promise((resolve, reject) => {

    const listName = `messages:user:${userId}:page:${pageId}`;
    const shopKeyName = `customerswaiting:page:${pageId}`;

    getClient().delAsync(listName).then((res) => {
      logging.info(`Delete : ${res}`);

      return getClient().decrAsync(shopKeyName);
    }).then((len) => {
      logging.info(`(DECR) ${len} users waiting to do an action for the shop page id ${pageId}`);
      resolve();
    }).catch((err) => {
      reject(err);
    });

  });
}

module.exports = {
  getClient,
  initClient,
  saveMessage,
  retrieveMessages,
  deleteMessages
};
