import config from 'config';
import Promise from 'bluebird';
import {parseAccessTokenResponse} from './other';
import { Shop, Message, Conversation } from '../mongo/models';
import logging from '../lib/logging';
import request from 'request';
import rp from 'request-promise';
import moment from 'moment';
import { pubsub } from '../graphql/subscriptions';
import background from '../lib/background';
import messaging from './messaging';

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
    let readMessages = [];
    let postbackMessages = [];
    entry.messaging.forEach((messagingEvent) => {

      //Event with a message
      if (messagingEvent.message) {
        rightMessages.push(messagingEvent);
      }
      else if(messagingEvent.postback){
        logging.info("WE HAVE A POSTBACK !!!");
        if(messagingEvent.postback.payload === "GET_STARTED"){
          logging.info("Start postback");
          postbackMessages.push(messagingEvent);
        }
      }
      else if(messagingEvent.read){
        readMessages.push(messagingEvent)
      }

      //TODO: Message delivery
    });

    if(rightMessages.length > 0){
      Shop.findOne({ pageId: pageID }, (err, shop) => {
        if(err) reject(err);

        //Mark the messages as received
        if(!rightMessages[0].message.is_echo) sendAction(shop, rightMessages[0].sender.id);

        Promise.each(rightMessages, (messagingEvent) => {
          return manageMessage(messagingEvent, shop);
        }).then(() => {
          resolve();
        }).catch((error) => {
          reject(error);
        });
      });
    }
    else if(readMessages.length > 0){
      Conversation.justRead(pageID, readMessages[readMessages.length - 1].sender.id, readMessages[readMessages.length - 1].read.watermark).then((conversation) => {
        resolve();
      }).catch((err) => {
        reject(err);
      })
    }
    else if(postbackMessages.length > 0){
      //TODO: Manage get started postback
      Shop.findOne({ pageId: pageID }, (err, shop) => {
        if(err) reject(err);

        const messageData = {
          recipient: {
            id: postbackMessages[0].sender.id
          },
          message: {
            text: "Bienvenue. Comment pouvons nous vous aider ? Vous avez peut être besoin d'un conseil pour un produit ?"
          }
        };

        send(messageData, shop.pageToken).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        })
      });
    }
    else{
      resolve();
    }
  });



}

function manageMessage(messageObject, shop){

  return new Promise(function(resolve, reject){

    const messageText = messageObject.message.text;
    const messageAttachements = messageObject.message.attachments;

    // Text in the message
    if (messageText){
      logging.info(messageText);
    }


    if(messageObject.message.is_echo){
      if(messageObject.message.attachments && messageObject.message.attachments[0].payload == null){
        logging.info("Can't treat it for the moment");
        resolve();
      }
      else{
        Message.createFromFacebookEcho(messageObject, shop).then(function(message){
          //Push to the agent the message if he did not send it
          //TODO : We will need to push anyway if we gave multiple agent
          if(message.echoType != "standard"){
            pubsub.publish('messageAdded', message);
          }

          resolve(message);
        }).catch(function(err){
          reject(err);
        })
      }

    }
    else{
      Message.createFromFacebook(messageObject, shop).then(function(message){
        //Send to subscriptions the new message
        pubsub.publish('messageAdded', message);

        //If it is a payload, we have to do an automatic action
        if(messageObject.message.quick_reply != null){
          managePayloadAction(shop, message.sender, messageObject.message.quick_reply.payload).then(() => {
            resolve((message));
          }).catch((err) => {
            reject(err);
          })
        }
        else{
          resolve(message);
        }
      }).catch(function(err){
        reject(err);
      });
    }

  });

}

/*
* Manage Payload Actions
*/

function managePayloadAction(shop, user, payload){

  return new Promise((resolve, reject) => {

    switch (payload) {
      case config.PAYLOAD_INFOS_CART:
        messaging.sendInfosCartState(shop, user).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });

        break;
      case config.PAYLOAD_INFOS_CART_LIST_PRODUCTS:
        messaging.sendListPoductsCart(shop, user).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });

        break;
      default:
        logging.info("Does not know this payload");
    }

  });

}

/*
* Get the user infos from FB
*/


exports.getFacebookUserInfos = function(shop, userId){

  let uri = `https://graph.facebook.com/v2.6/${userId}`;

  return new Promise(function (resolve, reject){

    const options = {
      uri: uri,
      qs: {
        fields: 'first_name,last_name,profile_pic,locale,timezone,gender,last_ad_referral',
        access_token: shop.pageToken
      },
      json: true,
      method: 'GET',
      simple: false,
      resolveWithFullResponse: true
    }

    rp(options).then((response) => {
      logging.info("USER INFOS GOT");
      if(response.statusCode == 400) resolve(false);
      else{
        console.log(response.body);
        resolve(response.body);
      }
    }).catch((err) => {
      logging.error("Request error : " + err.message);
      reject(err);
    })

    // //Request FB API
    // request({
    //   uri: uri,
    //   qs: {
    //     fields: 'first_name,last_name,profile_pic,locale,timezone,gender,last_ad_referral',
    //     access_token: shop.pageToken
    //   },
    //   json: true,
    //   method: 'GET'
    // }, function(error, response, body){
    //
    //   if(!error && response.statusCode == 200){
    //     logging.info(body);
    //     resolve(body);
    //   }
    //   else if(error){
    //     logging.error("Request error : " + error);
    //     reject(error);
    //   }
    //   else{
    //     logging.info(body);
    //     resolve({});
    //   }
    //
    // });
  });

}


/////////////////////////////////////////////
///////////// SEND //////////////////////////
/////////////////////////////////////////////


/*
* Send a message to a user
*/

function sendMessage(shop, recipientId, text, metadata){


  let messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text
    }
  };

  if(metadata) messageData.message.metadata = metadata;

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
      if(metadata){
        newMessage.echoType = metadata;
      }
      else{
        newMessage.echoType = "standard";
      }
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
      newMessage.echoType = "standard";
      return newMessage.save();

    }).then((message) => {
      resolve(message);
    }).catch((err) => {
      reject(err);
    });

  });
}


/*
* SEND A MESSAGE WITH QUICK REPLIES
*/

function sendTextWithQuickReplies(shop, recipientId, text, replies, metadata){

  const messageData = {
    recipient : {
      id: recipientId
    },
    message: {
      text : text,
      quick_replies: replies
    }
  }

  if(metadata) messageData.message.metadata = metadata;

  return new Promise((resolve, reject) => {
    send(messageData, shop.pageToken).then((parsedBody) =>{
      logging.info("Send Text with Quick Replies ");
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })
  });
}


/*
* A button to open a webview
*/

function sendButtonForPayCart(shop, recipientId, cart){

  const apiPayUrl = `${config.serverURL}shop/pay/${cart.ask_payment_token}`;

  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      metadata : "askPayCart",
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `Vous pouvez dès à présent finir votre achat en validant votre panier, d'un montant de ${cart.totalPrice}€, en cliquant ci dessous.👇👇👇👇👇`,
          buttons: [
            {
              type: "web_url",
              url: apiPayUrl,
              title: "Valider mon panier 🛒",
              messenger_extensions : true,
              fallback_url : apiPayUrl
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
    const sub = order.price * 0.8;
    const total_tax = order.price * 0.2;

    order.getSelectionsForFacebook().then((elements) => {

      const messageData = {
        recipient: {
          id: order.user.facebookId
        },
        message: {
          metadata : "receipt",
          attachment: {
            type: "template",
            payload: {
              template_type: "receipt",
              recipient_name: `${order.user.firstName} ${order.user.lastName}`,
              order_number: order._id,
              currency: "EUR",
              payment_method: payment_method,
              elements : elements,
              address : {
                street_1 : `${order.shippingAddress.streetNumber} ${order.shippingAddress.route}`,
                city: `${order.shippingAddress.locality}`,
                postal_code: `${order.shippingAddress.postalCode}`,
                state: `${order.shippingAddress.region}`,
                country: `${order.shippingAddress.country}`
              },
              timestamp: moment(order.chargeDate).unix(),
              summary: {
                subtotal: sub,
                total_cost: order.price,
                total_tax: total_tax,
                shipping_cost: 0.00
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

function subscribePageToApp(shop){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.8/me/subscribed_apps`;
    const options = {
      uri: uri,
      qs: {
        access_token: shop.pageToken
      },
      json: true,
      method: 'POST'
    }

    rp(options).then((parsedBody) => {
      logging.info("Subscribded to page :");
      logging.info(parsedBody);

      return whitelistDomains(shop.pageToken);
    }).then(() => {
      return setGetStarted(shop)
    }).then(() => {
      resolve();
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


function getInsightsAd(shop, ad){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.8/${ad.adId}/insights`;
    const options = {
      uri: uri,
      qs: {
        fields: "call_to_action_clicks,frequency,impressions,spend",
        access_token: "EAAHZBZCMzElzoBANvOBegFpvY5d8LnoY0qmlQOOKj1wmOflh00jlS07vKgAai3AV7o5GxooNATm36W391feEH5ZA5rlR1LOKicrmNoPTySRHZAGuhqjm3bejW3FfeubR1ZAwaNfGUENCHp5BmcimdOp7gMnTdR98ZD"
      }
    }

    rp(options).then((parsedBody) => {
      logging.info("Ad Insight");
      logging.info(parsedBody);
      resolve(ad);
    }).catch((error) => {
      reject(error);
    })
  });
}

/*
* Messenger Profile
*/

function readMessengerProfile(shop){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.8/me/messenger_profile`;
    const options = {
      uri: uri,
      qs: {
        fields: "account_linking_url,persistent_menu,target_audience,get_started,greeting,whitelisted_domains",
        access_token: shop.pageToken
      }
    }

    rp(options).then((parsedBody) => {
      logging.info("Messenger Profile");
      logging.info(parsedBody);
      resolve(parsedBody);
    }).catch((error) => {
      reject(error);
    })
  });
}

function removeMessengerProfileInfos(shop, infos){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.6/me/messenger_profile`;
    const options = {
      uri: uri,
      qs: {
        access_token: shop.pageToken
      },
      json: {
        fields: infos
      },
      method: 'DELETE'
    }

    rp(options).then((parsedBody) => {
      logging.info("Removed infos from Messenger Profile");
      logging.info(parsedBody);
      resolve(parsedBody);
    }).catch((error) => {
      reject(error);
    })
  });
}


function setGetStarted(shop){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.6/me/messenger_profile`;
    const options = {
      uri: uri,
      qs: {
        access_token: shop.pageToken
      },
      json: {
        get_started: {
          payload: "GET_STARTED"
        }
      },
      method: 'POST'
    }

    rp(options).then((parsedBody) => {
      logging.info("Added get started");
      logging.info(parsedBody);
      shop.isGetStartedActivated = true;
      return shop.save();
    }).then((shop) => {
      resolve(shop);
    }).catch((error) => {
      reject(error);
    })
  });
}

function setGreetingMessenger(shop, text){
  return new Promise((resolve, reject) => {

    const uri = `https://graph.facebook.com/v2.6/me/messenger_profile`;
    const options = {
      uri: uri,
      qs: {
        access_token: shop.pageToken
      },
      json: {
        greeting: [
          {
            locale: "default",
            text: text
          }
        ]
      },
      method: 'POST'
    }

    rp(options).then((parsedBody) => {
      logging.info("Added greeting");
      logging.info(parsedBody);
      resolve(parsedBody);
    }).catch((error) => {
      reject(error);
    })
  });
}


exports.setGreetingMessenger = setGreetingMessenger;
exports.removeMessengerProfileInfos = removeMessengerProfileInfos;
exports.setGetStarted = setGetStarted;
exports.readMessengerProfile = readMessengerProfile;
exports.getInsightsAd = getInsightsAd;
exports.sendTextWithQuickReplies = sendTextWithQuickReplies;
exports.sendReceipt = sendReceipt;
exports.sendButtonForPayCart = sendButtonForPayCart;
exports.sendMessage = sendMessage;
exports.subscribePageToApp = subscribePageToApp;
exports.getLongToken = getLongToken;
exports.getPages = getPages;
exports.sendAction = sendAction;
exports.sendImage = sendImage;
