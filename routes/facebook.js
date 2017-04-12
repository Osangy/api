import config from 'config';
import { manageEntry, sendMessage, sendAction, sendImage, getLongToken, getPages, subscribePageToApp, readMessengerProfile, setGetStarted, setGreetingMessenger } from '../utils/facebookUtils';
import prettyjson from 'prettyjson';
import logging from '../lib/logging';
import Promise from 'bluebird';
import background from '../lib/background';
import { Shop } from '../mongo/models';

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

  logging.info("New message from facebook");
  logging.info(data);

  // Make sure this is a page subscription
  if (data.object == 'page') {

    //Queue all the entry to be processed by a worker
    data.entry.forEach((pageEntry) => {
      background.queueEntry(pageEntry);
    });

    res.sendStatus(200);
  }
  else{
    res.sendStatus(200);
  }
};


//========================================
// Get Pages
//========================================
exports.accessPagesList = function(req, res, next) {

  const shortToken = req.query.shortToken;

  if (!shortToken) {
    return res.status(422).send({ error: 'You must provide a token'});
  }

  const userId = req.query.userId;

  if (!userId) {
    return res.status(422).send({ error: 'You must provide a user id'});
  }

  //Exchange the short token to a long token
  getLongToken(shortToken).then((access_token) => {

    return getPages(userId, access_token);
  }).then( (pagesList) => {
    res.status(200).json(pagesList);

  }).catch((error) => {
    logging.error(error);
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

/*
* Resubscribe to a page
*/

exports.reSub = function(req, res){


  Shop.findOne({ pageId : req.params.pageId}).then((shop) => {
    if(!shop){
      res.status(500).send("No Shop with this page id");
    }
    else{
      subscribePageToApp(shop.pageToken).then((success) => {
        res.status(200).send(success);

      }).catch((err) => {
        res.status(500).send(err.message);
      })
    }
  }).catch((err) => {
    res.status(500).send(err.message);
  })

}


/*
* Messenger Profile Infos
*/

exports.messengerInfos = function(req, res){


  Shop.findOne({ pageId : req.params.pageId}).then((shop) => {
    if(!shop){
      res.status(500).send("No Shop with this page id");
    }
    else{
      setGreetingMessenger(shop, "Bébé Tshirt, la boutique de vos petits bout de chou 👶🏻").then((body) => {
        res.send(body);
      }).catch((err) => {
        res.status(500).send(err.message);
      })
    }
  }).catch((err) => {
    res.status(500).send(err.message);
  })

}
