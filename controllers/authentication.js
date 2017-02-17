import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Shop } from '../mongo/models';
import config from 'config';
import { subscribePageToApp } from '../utils/facebookUtils';
import logging from '../lib/logging';


function generateToken(shop) {
  return jwt.sign(shop, config.jwtSecret);
}

function setShopInfo(request) {

  var infos = {
    _id: request._id,
    shopName: request.shopName,
    email: request.email,
    pageId : request.pageId,
    pageToken: request.pageToken
  }

  if(request.stripe){
    infos.stripe = request.stripe;
  }

  return infos;
}

//========================================
// Login Route
//========================================
exports.login = function(req, res, next) {

  let shopInfos = setShopInfo(req.user);

  res.status(200).json({
    token: 'JWT ' + generateToken(shopInfos),
    shop: shopInfos
  });
}


//========================================
// Registration Route
//========================================
exports.register = function(req, res, next) {
  // Check for registration errors
  logging.info(req.body);
  const email = req.body.email;
  const shopName = req.body.shopName;
  const password = req.body.password;
  const pageId = req.body.pageId;
  const pageAccessToken = req.body.pageToken;

  // Return error if no email provided
  if (!email) {
    return res.status(422).send({ error: 'You must enter an email address.'});
  }

  // Return error if full name not provided
  if (!shopName) {
    return res.status(422).send({ error: 'You must enter your shop name.'});
  }

  // Return error if no password provided
  if (!password) {
    return res.status(422).send({ error: 'You must enter a password.' });
  }

  if(!pageId){
    return res.status(422).send({ error: 'You must enter a pageId.' });
  }

  if(!pageAccessToken){
    return res.status(422).send({ error: 'You must enter a page Access Token.' });
  }

  //TODO: Verifier qu'une page avec le même id n'est pas déjà associé à un compte

  Shop.findOne({ email: email }, function(err, existingShop) {
      if (err) { return next(err); }

      // If user is not unique, return error
      if (existingShop) {
        return res.status(422).send({ error: 'That email address is already in use.' });
      }

      // If email is unique and password was provided, create account
      let shop = new Shop({
        email: email,
        password: password,
        shopName: shopName,
        pageId: pageId,
        pageToken: pageAccessToken
      });

      //Save the shop
      shop.save().then(function(savedShop){

        logging.info(shop.pageToken);
        //Once saved, we subscribe the app to the page
        return subscribePageToApp(shop.pageToken);
      }).then(function(){

        const shopInfos = setShopInfo(shop);
        logging.info("Passed subscribe to page");

        res.status(201).json({
          token: 'JWT ' + generateToken(shopInfos),
          shop: shopInfos
        });

      }).catch((error) => {
        logging.error(error.message);
        return next(error);
      });
  });
}
