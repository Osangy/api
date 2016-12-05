import prettyjson from 'prettyjson';
import { Message } from '../../model/mongo'

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

exports.cetegorizeMessage = function(messageObject){
  let senderId = messageObject.sender.id;
  let recipientId = messageObject.recipient.id;
  let timeOfMessage = messageObject.timestamp;
  let message = new Message(messageObject.message);

  // if(process.env.NODE_ENV != "production"){
  //   console.log(`\nMESSAGE:\n${prettyjson.render(message, prettyConfig)}`);
  // }

  let messageId = message.mid;
  let messageText = message.text;
  let messageAttachements = message.attachments;

  // Text in the message
  if (messageText){
    console.log(`\nReceived a message with some text :\n\n${messageText}`);
  }

  //Attechment in the message
  if(messageAttachements){

    console.log(`\nReceived a message with an attachement of type ${messageAttachements[0].type}`);

  }

  message.save(function (err, message) {
    if (err) return console.error(err);
    console.log("Saved the message ;)");
  });

}
