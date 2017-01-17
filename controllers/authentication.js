import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Shop } from '../mongo/model';
import config from 'config';
import { subscribePageToApp } from '../utils/facebookUtils';


function generateToken(shop) {
  return jwt.sign(shop, config.jwtSecret);
}

function setShopInfo(request) {
  return {
    _id: request._id,
    shopName: request.shopName,
    email: request.email,
    pageId : request.pageId,
    pageToken: request.pageToken
  };
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
  console.log(req.body);
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

        //Once saved, we subscribe the app to the page
        return subscribePageToApp(shop.pageToken);
      }).then(function(){

        let shopInfos = setShopInfo(shop);

        res.status(201).json({
          token: 'JWT ' + generateToken(shopInfos),
          shop: shopInfos
        });

      }).catch(function(error){
        return next(err);
      });

      shop.save(function(err, shop) {
        if (err) { return next(err); }


        let shopInfos = setShopInfo(shop);

        res.status(201).json({
          token: 'JWT ' + generateToken(shopInfos),
          shop: shopInfos
        });
      });
  });
}
