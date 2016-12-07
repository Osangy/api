import { Message, User } from '../mongo/model';
import request from 'request';
import config from 'config';
import Promise from 'bluebird'

let prettyConfig = {
  keysColor: 'rainbow',
  dashColor: 'magenta',
  stringColor: 'white'
};


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


    Promise.each(rightMessages, function(messagingEvent){
      return manageMessage(messagingEvent, pageID);
    }).then(function(){
      resolve();
    }).catch(function(error){
      reject(error);
    })
  });



}

function manageMessage(messageObject, pageID){

  return new Promise(function(resolve, reject){

    const messageText = messageObject.message.text;
    const messageAttachements = messageObject.message.attachments;

    // Text in the message
    if (messageText){
      console.log(`\nReceived a message with some text :\n\n${messageText}`);
    }

    //Attechment in the message
    if(messageAttachements){

      console.log(`\nReceived a message with an attachement of type ${messageAttachements[0].type}`);

    }

    Message.createFromFacebook(messageObject, pageID).then(function(message){
      resolve(message);
    }).catch(function(err){
      reject(err);
    })

  });

}


/*
* Get the user infos from FB
*/


exports.getFacebookUserInfos = function(userId){

  let uri = `https://graph.facebook.com/v2.6/${userId}`;

  return new Promise(function (resolve, reject){
    //Request FB API
    request({
      uri: uri,
      qs: {
        fields: 'first_name,last_name,profile_pic,locale,timezone,gender',
        access_token: config.pageAccessToken
      },
      json: true,
      method: 'GET'
    }, function(error, response, body){

      if(!error && response.statusCode == 200){
        resolve(body);
      }
      else{
        console.error("Request error : " + error);
        reject(error);
      }

    });
  });

}



/*
* Send a message to a user
*/

exports.sendMessage = function(recipientId, text){

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
      qs: { access_token: config.pageAccessToken },
      method: 'POST',
      json: messageData

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var recipientId = body.recipient_id;
        var messageId = body.message_id;

        resolve(body);
      } else {
        reject(err);
      }
    });
  });


}
