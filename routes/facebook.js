import config from 'config';
import prettyjson from 'prettyjson';
import { cetegorizeMessage } from '../utils/facebook/receive';

/*
* Webhook Validation
*/

exports.webhookValidation = function(req, res){
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === config.validationToken) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
};


/*
* Webhook Message reception
*/

exports.webhookPost = function(req, res){
  var data = req.body;

  if(process.env.NODE_ENV != "production"){
    console.log(`\nALL OBJECT :\n${prettyjson.render(data)}\n`);
  }


  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;


      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.message) {
          //receivedMessage(messagingEvent);
          cetegorizeMessage(messagingEvent)
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
};


function receivedMessage(messagingEvent){

  if(process.env.NODE_ENV != "production"){
    console.log(`\nTEXT MESSAGE OBJECT:\n${prettyjson.render(messagingEvent.message)}\n`);
  }

}
