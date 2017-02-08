import request from 'request';
import config from 'config';
import Promise from 'bluebird';
import {parseAccessTokenResponse} from './other';
import { Shop, Message } from '../mongo/models';
import logging from '../lib/logging';


var AttachmentTypes = {
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  FILE: "file",
  LOCATION: "location"
};

exports.manageEntry = function(entry){

  return new Promise(function(resolve, reject){
    let pageID = entry.id;
    let timeOfEvent = entry.time;



    //Remove the entries that does not have a message object
    let rightMessages = [];
    entry.messaging.forEach(function(messagingEvent){

      //Event with a message
      if (messagingEvent.message) {
        rightMessages.push(messagingEvent);
      }

      //TODO: Message delivery
      //TODO: Message read
    })

    Shop.findOne({ pageId: pageID }, function(err, shop) {
      if(err){
        reject(err);
      }

      //Mark the messages as received
      if(rightMessages.length > 0){
        if(!rightMessages[0].message.is_echo){
          sendAction(shop, rightMessages[0].sender.id);
        }
      }

      Promise.each(rightMessages, function(messagingEvent){
        return manageMessage(messagingEvent, shop);
      }).then(function(){
        resolve();
      }).catch(function(error){
        reject(error);
      })

    });



  });



}

function manageMessage(messageObject, shop){

  return new Promise(function(resolve, reject){

    const messageText = messageObject.message.text;
    const messageAttachements = messageObject.message.attachments;

    // Text in the message
    if (messageText){
      logging.info(`\nReceived a message with some text :\n\n${messageText}`);
    }

    //Attechment in the message
    if(messageAttachements){

      logging.info(`\nReceived a message with an attachement of type ${messageAttachements[0].type}`);

    }

    Message.createFromFacebook(messageObject, shop).then(function(message){
      resolve(message);
    }).catch(function(err){
      reject(err);
    })

  });

}


/*
* Get the user infos from FB
*/


exports.getFacebookUserInfos = function(shop, userId){

  let uri = `https://graph.facebook.com/v2.6/${userId}`;

  return new Promise(function (resolve, reject){
    //Request FB API
    request({
      uri: uri,
      qs: {
        fields: 'first_name,last_name,profile_pic,locale,timezone,gender',
        access_token: shop.pageToken
      },
      json: true,
      method: 'GET'
    }, function(error, response, body){

      if(!error && response.statusCode == 200){
        resolve(body);
      }
      else{
        logging.error("Request error : " + error);
        reject(error);
      }

    });
  });

}



/*
* Send a message to a user
*/

var sendMessage = exports.sendMessage = function(shop, recipientId, text){

  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text
    }
  };

  return new Promise(function(resolve, reject){
    request({
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: shop.pageToken },
      method: 'POST',
      json: messageData

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var recipientId = body.recipient_id;
        var messageId = body.message_id;

        resolve(body);
      } else {
        if(error){
          reject(error);
        }
        else{
          logging.error(body);
          let error = new Error("Error when sending facebook message");
          reject(error)
        }

      }
    });
  });


}

function sendImage(shop, recipientId, imageUrl){
  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: imageUrl
        }
      }
    }
  };

  return new Promise(function(resolve, reject){
    request({
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: shop.pageToken },
      method: 'POST',
      json: messageData

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var recipientId = body.recipient_id;
        var messageId = body.message_id;

        resolve(body);
      } else {
        if(err){
          reject(err);
        }
        else{
          let error = new Error("Error when sending facebook message");
          reject(error)
        }

      }
    });
  });
}


function sendAction(shop, recipientId, action = "mark_seen"){
  const messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: action
  };


  return new Promise(function(resolve, reject){
    request({
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: shop.pageToken },
      method: 'POST',
      json: messageData

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(body);
      } else {
        if(error){
          reject(error);
        }
        else{
          let error = new Error("Error when sending sender action");
          reject(error)
        }

      }
    });
  });
}



//========================================
// Facebook Long Token
//========================================
function getLongToken(shortToken) {

  return new Promise(function(resolve, reject){

    let uri = `https://graph.facebook.com/oauth/access_token`;

    //Request FB API
    request({
      uri: uri,
      qs: {
        grant_type: 'fb_exchange_token',
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortToken
      },
      json: true,
      method: 'GET'
    }, function(error, response, body){

      if(!error && response.statusCode == 200){
        resolve(parseAccessTokenResponse(response.body));
      }
      else{
        reject(error);
      }

    });

  });

}


//========================================
// Facebook Get Pages of the user
//========================================

function getPages(userId, longToken){
  return new Promise(function(resolve, reject){

    let uri = `https://graph.facebook.com/v2.8/${userId}/accounts`;

    //Request FB API
    request({
      uri: uri,
      qs: {
        access_token: longToken
      },
      json: true,
      method: 'GET'
    }, function(error, response, body){

      if(!error && response.statusCode == 200){
        resolve(body.data);
      }
      else{
        reject(error);
      }

    });

  });
}


//========================================
// Facebook Get Pages of the user
//========================================

function subscribePageToApp(pageToken){
  return new Promise(function(resolve, reject){

    let uri = `https://graph.facebook.com/v2.8/me/subscribed_apps`;

    //Request FB API
    request({
      uri: uri,
      qs: {
        access_token: pageToken
      },
      json: true,
      method: 'POST'
    }, function(error, response, body){

      if(!error && response.statusCode == 200){
        logging.info("Subscribded to page :");
        logging.info(body);
        resolve(body);
      }
      else{
        reject(error);
      }

    });

  });
}

exports.subscribePageToApp = subscribePageToApp;
exports.getLongToken = getLongToken;
exports.getPages = getPages;
exports.sendAction = sendAction;
exports.sendImage = sendImage;
