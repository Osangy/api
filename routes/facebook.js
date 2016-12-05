import config from 'config';
import prettyjson from 'prettyjson';
import { manageEntry } from '../utils/facebookUtils';

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
