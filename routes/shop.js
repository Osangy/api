import config from 'config';
import _ from 'lodash';
import { Shop, Cart } from '../mongo/models';
import Promise from 'bluebird';
import logging from '../lib/logging';
import stripe from '../utils/stripe';
import background from '../lib/background';
import moment from 'moment';
import facebook from '../utils/facebookUtils';
import messaging from '../utils/messaging';

Promise.promisifyAll(require("mongoose"));


/*
* Simple pay page
*/

exports.paySimple = function(req, res){
  const cartToken = req.params.cartToken;

  Cart.findOne({ask_payment_token : cartToken}).populate('selections.variant user').then((cart) => {
    if(!cart) res.send("Sorry but we did not find any cart. You probably already paid for it !");
    else{
      // res.render('pay', {
      //   cartToken : cartToken,
      //   price: cart.totalPrice
      // });
      let variantTitles = [];
      cart.selections.forEach((selection) => {
        variantTitles.push(selection.variant.getTitle());
      });

      res.render('checkout', {
        cart: cart,
        titles: variantTitles,
        stripe_pub_key: config.STRIPE_PUB_KEY
      });
    }
  }).catch((err) => {
    res.send(err.message);
  })


};

/*
* Example Pay Test
*/

exports.testPay = function(req, res){
  const cartToken = req.params.cartToken;
  Cart.findOne({ask_payment_token : cartToken}).populate('selections.variant user').then((cart) => {
    if(!cart) res.send("Sorry but we did not find any cart. You probably already paid for it !");
    else{
      res.render('checkout', {
        cart: cart,
        stripe_pub_key: config.STRIPE_PUB_KEY
      });
    }
  }).catch((err) => {
    res.send(err.message);
  })

};


exports.validatePayment = function(req, res){


  const token = req.body.token; // Using Express
  const cartToken = req.body.cartToken;
  let nowCart;

  console.log(cartToken);

  Cart.findOne({ask_payment_token : cartToken}).populate('shop user').then((cart) => {

    if(!cart){
      res.send("Error finding your cart. Your payment has been cancelled");
    }
    else{
      nowCart = cart;
      console.log(cart.totalPrice);
      return stripe.chargeForShop(cart.shop, cart.totalPrice, token, `Payment for cart ${cart._id}`);
    }

  }).then((charge) => {

    //Once charged, we update the cart
    nowCart.isPaid = true;
    nowCart.chargeId = charge.id;
    nowCart.chargeDate = moment();
    nowCart.charge = JSON.stringify(charge);
    nowCart.ask_payment_token = null;
    return nowCart.save();


  }).then((cart) => {

    return messaging.sendConfirmationPayment(cart.shop, cart.user, cart);
  }).then(() => {
    //Queue the fact to send a message + create a command + update the charge
    background.queuePaidCart(nowCart._id);

    res.send("charged");

  }).catch((err) => {
    res.send(err.message);
  })

};
