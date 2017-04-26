import redis from 'redis';
import Promise from 'bluebird';
import logging from '../lib/logging';

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

let client;


function getClient(){
  if(!this.client){
    logging.info("NEED TO INIT REDIS")
    initClient();
  }
  return this.client;
}

function initClient(){
  this.client = redis.createClient({
    url: "redis://redis-19256.c3.eu-west-1-2.ec2.cloud.redislabs.com:19256"
  });

  this.client.on("connect", () => {
    logging.info("Redis connected");
  });
}

/* UTILS */

module.exports = {
  getClient,
  initClient
};
