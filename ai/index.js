import apiai from 'apiai';
import _ from 'lodash';
import logging from '../lib/logging';
import { queueApiAiResponse } from '../lib/background';
import flows from '../flows';


class Ai {

  constructor(){
    this.apiAiService = apiai("4643debec90d43c097fa37f4bd755a30");
  }

  sendMessageEvent(conversation, user, messageEvent){

    let contexts = {};
    if((!conversation.aiContexts) || (conversation.aiContexts.length == 0)) {
        contexts = [{
          name: 'user_infos',
          parameters:{
            first_name: user.firstName,
            last_name: user.lastName
          }
        }];
      }
      else{
        contexts = JSON.parse(conversation.aiContexts);
      }


      if(messageEvent.message.text){
        let request = this.apiAiService.textRequest(messageEvent.message.text, {
            sessionId: conversation.id,
            contexts:contexts,
            originalRequest: {
              data: messageEvent,
              source: "facebook"
            }
        });


        request.on('response', (response) => queueApiAiResponse(response));

        request.on('error', (error) => logging.error(error));

        request.end();
    }
  }

  initContext(conversation){
    const options = {
        sessionId: conversation.id
    };

    let request = this.apiAiService.deleteContextsRequest(options);

    request.on('response', (response) => {
      logging.info(response)
      conversation.aiContexts = "";
      conversation.save().then((user) => {
        logging.info("Conv. user");
      })
    });

    request.end();
  }

  sendEvent(conversation, user, eventName){
    let contexts = {};
    if((!conversation.aiContexts) || (conversation.aiContexts.length == 0)) {
        contexts = [{
          name: 'user_infos',
          parameters:{
            first_name: user.firstName,
            last_name: user.lastName
          }
        }];
      }
      else{
        contexts = JSON.parse(conversation.aiContexts);
      }

      var event = {
          name: eventName
      };


      let request = this.apiAiService.eventRequest(event, {
          sessionId: conversation.id,
          contexts:contexts
      });

      request.on('response', (response) => queueApiAiResponse(response));

      request.on('error', (error) => logging.error(error));

      request.end();
  }

}

module.exports = Ai;
