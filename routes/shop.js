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
import {completeAddress} from '../utils/other';

Promise.promisifyAll(require("mongoose"));


/*
* Simple pay page
*/

exports.paySimple = function(req, res){
  const cartId = req.params.cartId;

  Cart.findById(cartId).populate('selections.variant user').then((cart) => {
    if(!cart) res.send("Sorry but we did not find any cart. You probably already paid for it !");
    else if(cart.selections.length == 0) res.send("Il n'y a pas de produit dans votre panier 😢");
    else{
      let variantTitles = [];
      cart.selections.forEach((selection) => {
        variantTitles.push(selection.variant.getTitle());
      });

      res.render('checkout', {
        cart: cart,
        cart_object: JSON.stringify(cart),
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
  const cartId = req.body.cartId;
  const shippingAddress = req.body.shippingAddress;
  const customerInfos = req.body.customerInfos;
  let nowCart;

  Cart.findById(cartId).populate('shop user').then((cart) => {

    if(!cart) throw new Error("Error finding your cart. Your payment has been cancelled");

    cart.shippingAddress = shippingAddress;
    cart.user.email = customerInfos.email;
    cart.user.phoneNumber = customerInfos.phone;
    nowCart = cart;

    let actions = [];

    actions.push(cart.save());
    actions.push(cart.user.save());

    return Promise.all(actions);

  }).then(() => {

    return stripe.chargeForShop(nowCart.shop, nowCart.totalPrice, token, `Payment for cart ${nowCart._id}`);

  }).then((charge) => {

    //Once charged, we update the cart
    nowCart.isPaid = true;
    nowCart.chargeId = charge.id;
    nowCart.chargeDate = moment();
    nowCart.charge = JSON.stringify(charge);
    nowCart.ask_payment_token = null;
    return nowCart.save();


  }).then((cart) => {
    nowCart = cart;
    return messaging.sendConfirmationPayment(cart.shop, cart.user, cart);
  }).then(() => {
    //Queue the fact to send a message + create a command + update the charge
    background.queuePaidCart(nowCart._id);

    res.send("charged");

  }).catch((err) => {
    res.send(err.message);
  })

};
