import config from 'config';
import Promise from 'bluebird';
import {parseAccessTokenResponse} from './other';
import { Shop, Message, Conversation, Product, User, Cart } from '../mongo/models';
import logging from '../lib/logging';
import request from 'request';
import rp from 'request-promise';
import moment from 'moment';
import { pubsub } from '../graphql/subscriptions';
import background from '../lib/background';
import messaging from './messaging';
import flows from '../flows';
import _ from 'lodash';

Promise.promisifyAll(require("mongoose"));

var AttachmentTypes = {
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  FILE: "file",
  LOCATION: "location"
};

exports.manageEntry = function(entry){

  return new Promise((resolve, reject) => {
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
        postbackMessages.push(messagingEvent);
      }
      else if(messagingEvent.read){
        readMessages.push(messagingEvent)
      }

      //TODO: Message delivery
    });

    if(rightMessages.length > 0){
      logging.info(`The page ID is ${pageID}`)
      Shop.findOne({ pageId: pageID }, (err, shop) => {
        if(err) reject(err);
        if(!shop) reject(new Error("Does not have a page with this ID"));

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
      Shop.findOne({ pageId: pageID }, (err, shop) => {
        if(err) reject(err);
        if(!shop) reject(new Error(`No shop with this id : ${pageID}`));


        Promise.each(postbackMessages, (messagingEvent) => {
          return managePostback(shop, messagingEvent);
        }).then(() => {
          resolve();
        }).catch((error) => {
          reject(error);
        });

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
      let finalMessage;
      Message.createFromFacebook(messageObject, shop).then((message) => {
        //Send to subscriptions the new message
        pubsub.publish('messageAdded', message);
        finalMessage = message;
        return managePayloadAction(shop, message);
      }).then(() => {

        return flows.manageFlow(finalMessage);
      }).then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      });
    }

  });

}

/*
* Manage Payload Actions
*/

function managePayloadAction(shop, message){

  return new Promise((resolve, reject) => {

    if(!message.quick_reply) return resolve();
    else{
      const payload = message.quick_reply;
      const user = message.sender

      const spliitedPayload = _.split(payload, ':');
      const introPayload = spliitedPayload[0];

      switch (introPayload) {
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

        case "GET_STARTED":
          if(spliitedPayload.length < 2) break;

          switch(spliitedPayload[1]){
            case "LOVE":
              logging.info("SEND LOVE");
              break;
            case "GIFT":
              logging.info("WANT GIFT");
              break;
            case "SAV":
              logging.info("NEED SAV");
              break;
            case "INFOS":
              logging.info("WANT INFOS");
              break;
          }
          break;

        case "BUY_PRODUCT":
          if(spliitedPayload.length < 2) break;
          else{
            Product.findOne({reference : spliitedPayload[1]}).then((product) => {
              if(!product) reject(new Error("No product with this id found"));
              return sendMessage(shop, user.facebookId, product.longDescription, null);
            }).then(() => {
              resolve();
            }).catch((err) => {
              reject(err);
            })
          }
          break;


        default:
          logging.info("Does not know this payload");
          resolve();
      }
    }

  });

}


/*
Manage Postback
*/

function managePostback(shop, message){

  const payload = message.postback.payload;
  const customerFacebookId = message.sender.id;

  return new Promise((resolve, reject) => {

    const spliitedPayload = _.split(payload, ':');
    const introPayload = spliitedPayload[0];


    switch (introPayload) {

      //Get started with the shop conversation
      case "GET_STARTED":
        messaging.sendActionWhenGetStarted(shop, customerFacebookId).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });
        break;

      case config.PAYLOAD_INFOS_CART:
        User.findOne({facebookId:customerFacebookId}).then((user) => {
          if(!user) throw new Error("No user with this facebook Id");
          return messaging.sendInfosCartState(shop, user);
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });

        break;
      case config.PAYLOAD_INFOS_CART_LIST_PRODUCTS:
        User.findOne({facebookId:customerFacebookId}).then((user) => {
          if(!user) throw new Error("No user with this facebook Id");
          return messaging.sendListPoductsCart(shop, user);
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });

        break;

      case config.PAYLOAD_VALIDATE_CART:
        User.findOne({facebookId:customerFacebookId}).then((user) => {
          if(!user) throw new Error(`No user found with the facebook id : ${customerFacebookId}`);
          return Cart.findOne({shop: shop, user: user});
        }).then((cart) => {
          if(!cart) throw new Error(`No cart found for user ${user.id} and shop ${shop.id}`);
          if(cart.selections.length == 0) return sendMessage(shop, customerFacebookId, `Votre panier est vide. 😭`, "giveCartState");
          return sendButtonForPayCart(shop, customerFacebookId, cart);
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });
        break;


      case "BUY_PRODUCT":
        if(spliitedPayload.length < 2) break;
        else{
          Product.findOne({_id : ObjectId(spliitedPayload[1])}).then((product) => {
            if(!product) throw new Error("No product with this id found");
            return sendMessage(shop, customerFacebookId, product.longDescription, null);
          }).then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          })
        }
        break;

      case "MORE_INFOS":
        if(spliitedPayload.length < 2) resolve();
        else{
          messaging.sendProductInfos(shop, customerFacebookId, spliitedPayload[1], "long").then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          })
        }
        break;

      case "MORE_PHOTOS":
        if(spliitedPayload.length < 2) resolve();
        else{
          messaging.sendProductInfos(shop, customerFacebookId, spliitedPayload[1], "morePhotos").then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          })
        }
        break;

      case "ADD_CART":
        if(spliitedPayload.length < 2) resolve();
        else{
          let finalUser;
          User.findOne({'facebookId' : customerFacebookId}).then((user) => {
            if(!user) throw new Error("No user with this facebook Id");

            finalUser = user;
            return Product.findById(spliitedPayload[1]);
          }).then((product) => {
            return flows.startFlow(finalUser, 'addCart', product, shop);
          }).then((res) => {
            resolve();
          }).catch((err) => {
            reject(err);
          })
        }
        break;

      default:
        logging.info("Does not know this postback");
    }


  });
}

/*
* Get the user infos from FB
*/


exports.getFacebookUserInfos = function(shop, userId){

  let uri = `https://graph.facebook.com/v2.6/${userId}`;

  return new Promise((resolve, reject) => {

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

  return new Promise((resolve, reject) => {

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

  return new Promise((resolve, reject) => {
    const apiPayUrl = `${config.serverURL}shop/pay/${cart.id}`;

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
            text: `Finissez votre achat dès maintenant en validant votre panier de ${cart.totalPrice}€, en cliquant ci-dessous.👇👇👇`,
            buttons: [
              {
                type: "web_url",
                url: apiPayUrl,
                title: 'Valider panier 🙌🏼',
                messenger_extensions : true,
                fallback_url : apiPayUrl
              }
            ]
          }
        }
      }
    };

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

function setPersistentMenu(shop, activate){
  return new Promise((resolve, reject) => {

    if(activate){
      const uri = `https://graph.facebook.com/v2.6/me/messenger_profile`;
      const options = {
        uri: uri,
        qs: {
          access_token: shop.pageToken
        },
        json: {
          persistent_menu: [{
            locale: 'default',
            call_to_actions: [
              {
                title: 'Mon panier 🛒',
                type:'nested',
                call_to_actions: [
                  {
                    title: "Récapitulatif 🛍",
                    type:'postback',
                    payload: config.PAYLOAD_INFOS_CART
                  },
                  {
                    title: "Liste des produits 📦",
                    type:'postback',
                    payload: config.PAYLOAD_INFOS_CART_LIST_PRODUCTS
                  },
                  {
                    title: "Valider mon panier 🙌🏼",
                    type:'postback',
                    payload: config.PAYLOAD_VALIDATE_CART
                  }
                ]
              },
              {
                title: 'Parler à un agent 🗣',
                type: 'postback',
                payload: config.PAYLOAD_TALK_TO_AGENT
              }
            ]
          }]
        },
        method: 'POST'
      }

      rp(options).then((parsedBody) => {
        logging.info("Added persistent menu");
        logging.info(parsedBody);
        return shop.save();
      }).then((shop) => {
        resolve(shop);
      }).catch((error) => {
        reject(error);
      })
    }
    else{
      removeMessengerProfileInfos(shop, ['persistent_menu']).then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      })
    }
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

exports.setPersistentMenu = setPersistentMenu;
exports.send = send;
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
