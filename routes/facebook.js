import config from 'config';
import { manageEntry, sendMessage } from '../utils/facebookUtils';
//import prettyjson from 'prettyjson';

let prettyConfig = {
  keysColor: 'rainbow',
  dashColor: 'magenta',
  stringColor: 'white'
};


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

  // Make sure this is a page subscription
  if (data.object == 'page') {

    let promise = Promise.resolve(null);

    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {

      //console.log(prettyjson.render(pageEntry, prettyConfig));

      promise = promise.then(function(){
        return manageEntry(pageEntry);
      });

    });


    promise.then(function(){
      console.log("Finished work");



      res.sendStatus(200);
    }).catch(function(error){
      console.log("Finished work with ERROR");
      console.error("Error : "+ error.message);
      res.sendStatus(200);
    })
  }
  else{
    res.sendStatus(200);
  }
};



exports.sendTest = function(req, res){

  sendMessage("994765810633262", "Hello gros ;)").then(function(body){
    res.sendStatus(200);
  }).catch(function(err){
    res.status(500).send(err.message);
  })


}
