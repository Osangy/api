import apiai from 'apiai';
import _ from 'lodash';
import logging from '../lib/logging';
import { queueApiAiResponse } from '../lib/background';


class Ai {

  constructor(){
    this.apiAiService = apiai("4643debec90d43c097fa37f4bd755a30");
  }

  sendEvent(who, event){

    if(event.message.text){
      let request = this.apiAiService.textRequest(event.message.text, {
          sessionId: who.id,
          contexts:[{
            name: 'user_infos',
            parameters:{
              first_name: who.firstName,
              last_name: who.lastName
            }
          }],
          originalRequest: {
            data: event,
            source: "facebook"
          }
      });


      //request.on('response', (response) => queueApiAiResponse(response));

      request.on('error', (error) => logging.error(error));

      request.end();
    }


  }

}

module.exports = Ai;
