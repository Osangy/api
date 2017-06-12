import _ from 'lodash';
import logging from '../lib/logging';
import { Conversation, User, Shop } from '../mongo/models';
import mongoose from 'mongoose';
import { sendMessage, sendTextWithQuickReplies } from '../utils/facebookUtils';
import messaging from '../utils/messaging';
import flows from '../flows';

let ObjectId = mongoose.Schema.ObjectId;

function manageResponseApiAi(response){

  logging.info('API.AI :')
  logging.info(response);

  if (isDefined(response.result) && isDefined(response.result.fulfillment)) {

      let responseText = response.result.fulfillment.speech;
      let responseData = response.result.fulfillment.data;
      let responseMessages = response.result.fulfillment.messages;

      let action = response.result.action;
      logging.info(`Action : ${action}`);

      let actionIncomplete = response.result.actionIncomplete;
      if(actionIncomplete) logging.info('Action not Complete')

      // if (this.isDefined(responseData) && this.isDefined(responseData.facebook)) {
      //     let facebookResponseData = responseData.facebook;
      //     this.doDataResponse(sender, facebookResponseData);
      // } else if (this.isDefined(responseMessages) && responseMessages.length > 0) {
      //     console.log("Messages");
      //     responseMessages.forEach((message) => console.log(message))
      // }

      console.log("Response : ");
      logging.info(`Response to give : ${responseText}`);

      // if(response.result.contexts.length > 0){
      //   response.result.contexts.forEach((context) => console.log(context));
      // }

      return new Promise((resolve, reject) => {
        let conv;
        Conversation.findById(response.sessionId).populate('shop user').then((conversation) => {
          if(conversation){
            conv = conversation;
            if(!conversation.isInRobotMode) throw 'noresponse';
            if(responseText) return chooseAction(response, conversation);
            else throw 'noresponse';
          }
          else{
            throw new Error("No conversation for this api.ai response");
          }
        }).then(() => {
          return conv.updateContext(response);
        }).then(() => {
          resolve();
        }).catch((err) => {
          logging.info(err);
          if(err === 'noresponse') resolve();
          else reject(err);
        })
      });
  }

}


function chooseAction(response, conversation){
  return new Promise((resolve, reject) => {

    let responseText = response.result.fulfillment.speech;

    if(!response.result.actionIncomplete){

      const repliesHuman = [{
        content_type:'text',
        title: 'Un humain vite !',
        payload: `ASK_HUMAN`
      }];


      switch (response.result.action) {
        case 'search_product' :
        case 'more_product' :
          const parameters = response.result.parameters;
          const categories = [response.result.parameters.sexe, response.result.parameters.type];
          logging.info(`Categories : ${categories}`);
          messaging.sendMoreProducts(conversation.shop, conversation.user, categories).then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });

          break;
        case 'input.unknown':
          const message = "Désolé mais je n'ai pas tout compris. Je ne suis qu'un bébé robot 👶. Peux tu répéter ? Sinon tu peux appeler un humain 😢";
          return sendTextWithQuickReplies(conversation.shop, conversation.user.facebookId, message, repliesHuman, "ai").then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          })

          break;
        case 'input.bad_feelings':
          //TODO: Find a human
          sendMessage(conversation.shop, conversation.user.facebookId, responseText, 'ai').then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });
          break;
        case 'human_help':
          //TODO: Find a human
          sendMessage(conversation.shop, conversation.user.facebookId, responseText, 'ai').then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });
          break;
        default:
          sendMessage(conversation.shop, conversation.user.facebookId, responseText, 'ai').then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });
      }
    }
    else{
      sendMessage(conversation.shop, conversation.user.facebookId, responseText, 'ai').then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      });
    }

  })
}


function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}


module.exports = {
  manageResponseApiAi
}
