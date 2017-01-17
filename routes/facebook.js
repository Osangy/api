import config from 'config';
import { manageEntry, sendMessage, sendAction, sendImage, getLongToken, getPages } from '../utils/facebookUtils';
import prettyjson from 'prettyjson';

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

  console.log(prettyjson.render(data, prettyConfig));

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


//========================================
// Get Pages
//========================================
exports.accessPagesList = function(req, res, next) {

  console.log("Start getting pages for user ");
  console.log(req.query.userId);
  const shortToken = req.query.shortToken;

  if (!shortToken) {
    return res.status(422).send({ error: 'You must provide a token'});
  }

  const userId = req.query.userId;

  if (!userId) {
    return res.status(422).send({ error: 'You must provide a user id'});
  }

  //Exchange the short token to a long token
  getLongToken(shortToken).then(function(access_token){
    console.log("New token long : ");
    console.log(access_token);


    return getPages(userId, access_token);
  }).then(function(pagesList){
    res.status(200).json(pagesList);

  }).catch(function(error){
    console.error(error);
    res.status(500).send(error.message);
  });

}



exports.sendTest = function(req, res){

  sendMessage("1125296200919840", "Hello gros ;)").then(function(body){
    res.sendStatus(200);
  }).catch(function(err){
    res.status(500).send(err.message);
  })


}

exports.sendTestImage = function(req, res){

  sendImage("1125296200919840", "https://cdn.shopify.com/s/files/1/1091/4600/products/Bandeau_Down_On_Ze_Corner_-_Fleuri_1_grande.JPG?v=1460897366").then(function(body){
    res.sendStatus(200);
  }).catch(function(err){
    res.status(500).send(err.message);
  })


}
