import config from 'config';
import Promise from 'bluebird';
import {parseAccessTokenResponse} from './other';
import { Shop, Message } from '../mongo/models';
import logging from '../lib/logging';
import request from 'request';
import rp from 'request-promise';
import moment from 'moment';
import { pubsub } from '../graphql/subscriptions';
import background from '../lib/background';

Promise.promisifyAll(require("mongoose"));

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
      logging.info(`Received a message with some text : ${messageText}`);
    }
    //Attachment in the message
    if(messageAttachements){
      logging.info(`Received a message with an attachement of type ${messageAttachements[0].type}`);
    }


    if(messageObject.message.is_echo){
      Message.createFromFacebookEcho(messageObject, shop).then(function(message){
        pubsub.publish('messageAdded', message);
        resolve(message);
      }).catch(function(err){
        reject(err);
      })
    }
    else{
      Message.createFromFacebook(messageObject, shop).then(function(message){
        //Send to subscriptions the new message
        pubsub.publish('messageAdded', message);
        resolve(message);
      }).catch(function(err){
        reject(err);
      })
    }

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


/////////////////////////////////////////////
///////////// SEND //////////////////////////
/////////////////////////////////////////////


/*
* Send a message to a user
*/

function sendMessage(shop, recipientId, text){


  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text
    }
  };

  return new Promise(function(resolve, reject){

    let newMessage;

    //Start by creating the message in our database
    Message.createFromShopToFacebook('text', text, recipientId, shop).then((messageObject) => {
      newMessage = messageObject;

      var options = {
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: shop.pageToken },
        method: 'POST',
        json: messageData
      }

      //Then send it to Facebook
      return rp(options);

    }).then((parsedBody) => {

      newMessage.mid = parsedBody.message_id;
      return newMessage.save();

    }).then((message) => {
      resolve(message);
    }).catch((err) => {
      reject(err);
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

    let newMessage;

    //Start by creating the message in our database
    Message.createFromShopToFacebook('image', imageUrl, recipientId, shop).then((messageObject) => {
      newMessage = messageObject;

      var options = {
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: shop.pageToken },
        method: 'POST',
        json: messageData
      }

      //Then send it to Facebook
      return rp(options);

    }).then((parsedBody) => {

      newMessage.mid = parsedBody.message_id;
      return newMessage.save();

    }).then((message) => {
      resolve(message);
    }).catch((err) => {
      reject(err);
    });

  });
}


/*
* A button to open a webview
*/

function sendButtonForPayCart(shop, recipientId, cart){

  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `Vous pouvez dès à présent finir votre achat en completant le paiement de votre panier d'un montant de ${cart.totalPrice}€ en cliquant ci dessous.`,
          buttons: [
            {
              type: "web_url",
              url: `https://cproject-api.ngrok.io/shop/pay/${cart._id}`,
              title: "Régler mon panier",
              messenger_extensions : true,
              fallback_url : `https://cproject-api.ngrok.io/shop/pay/${cart._id}`
            }
          ]
        }
      }
    }
  };

  return new Promise(function(resolve, reject){
    send(messageData, shop.pageToken).then((parsedBody) =>{
      logging.info("Send button for cart "+cart._id);
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })
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
    send(messageData, shop.pageToken).then((parsedBody) =>{
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })
  });
}


function sendReceipt(order){

  return new Promise((resolve, reject) => {
    const charge = JSON.parse(order.charge);
    const payment_method = `${charge.source.brand} ${charge.source.last4}`;

    order.getSelectionsForFacebook().then((elements) => {

      const messageData = {
        recipient: {
          id: order.user.facebookId
        },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "receipt",
              recipient_name: `${order.user.firstName} ${order.user.lastName}`,
              order_number: order._id,
              currency: "EUR",
              payment_method: payment_method,
              elements : elements,
              timestamp: moment(order.chargeDate).unix(),
              summary: {
                total_cost: order.price
              }
            }
          }
        }
      };

      return send(messageData, order.shop.pageToken);
    }).then((parsedBody) => {
      logging.info(`Receipt sent for order ${order._id}`);
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })
  })

}



function send(messageData, pageToken){

  return new Promise(function(resolve, reject){

    var options = {
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: pageToken },
      method: 'POST',
      json: messageData
    }

    rp(options).then((parsedBody) => {
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })

  });
}


/////////////////////////////////////////////
///////////// END SEND //////////////////////
/////////////////////////////////////////////


//========================================
// Facebook Long Token
//========================================
function getLongToken(shortToken) {

  return new Promise(function(resolve, reject){

    const uri = `https://graph.facebook.com/oauth/access_token`;
    const options = {
      uri: uri,
      qs: {
        grant_type: 'fb_exchange_token',
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortToken
      },
      json: true,
      method: 'GET'
    }

    rp(options).then((parsedBody) => {
      resolve(parseAccessTokenResponse(parsedBody));
    }).catch((error) => {
      reject(error);
    })

  });

}


//========================================
// Facebook Get Pages of the user
//========================================

function getPages(userId, longToken){
  return new Promise(function(resolve, reject){

    const uri = `https://graph.facebook.com/v2.8/${userId}/accounts`;

    const options = {
      uri: uri,
      qs: {
        access_token: longToken
      },
      json: true,
      method: 'GET'
    }

    rp(options).then((parsedBody) => {
      resolve(parsedBody.data);
    }).catch((error) => {
      reject(error);
    })

  });
}


//========================================
// Facebook Get Pages of the user
//========================================

function subscribePageToApp(pageToken){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.8/me/subscribed_apps`;
    const options = {
      uri: uri,
      qs: {
        access_token: pageToken
      },
      json: true,
      method: 'POST'
    }

    rp(options).then((parsedBody) => {
      logging.info("Subscribded to page :");
      logging.info(parsedBody);

      return whitelistDomains(pageToken);
    }).then((parsedBody) => {
      resolve(parsedBody);
    }).catch((error) => {
      reject(error);
    })
  });
}


function whitelistDomains(pageToken){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.6/me/thread_settings`;
    const options = {
      uri: uri,
      qs: {
        access_token: pageToken
      },
      json: {
        setting_type: "domain_whitelisting",
        whitelisted_domains: [config.serverURL],
        domain_action_type: "add"
      },
      method: 'POST'
    }

    rp(options).then((parsedBody) => {
      logging.info("Added domain to white list :");
      logging.info(parsedBody);
      resolve(parsedBody);
    }).catch((error) => {
      reject(error);
    })
  });
}

exports.sendReceipt = sendReceipt;
exports.sendButtonForPayCart = sendButtonForPayCart;
exports.sendMessage = sendMessage;
exports.subscribePageToApp = subscribePageToApp;
exports.getLongToken = getLongToken;
exports.getPages = getPages;
exports.sendAction = sendAction;
exports.sendImage = sendImage;
