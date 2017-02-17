import config from 'config';
import _ from 'lodash';
import { Shop, Cart } from '../mongo/models';
import Promise from 'bluebird';
import logging from '../lib/logging';
import stripe from '../utils/stripe';
import background from '../lib/background';

Promise.promisifyAll(require("mongoose"));


/*
* Simple pay page
*/

exports.paySimple = function(req, res){
  const cartId = req.params.cartId;

  Cart.findById(cartId).then((cart) => {
    if(!cart) res.send("Sorry but we did not find any cart");

    logging.info("Found a cart "+cart.totalPrice);

    res.render('pay', {
      cartId : cartId,
      price: cart.totalPrice
    });
  }).catch((err) => {
    res.send(err.message);
  })


};


exports.validatePayment = function(req, res){


  const token = req.body.token; // Using Express
  const cartId = req.body.cartId;
  let nowCart;


  Cart.findById(cartId).populate('shop').then((cart) => {

    if(!cart){
      res.send("Error finding your cart. Your payment has been cancelled");
    }
    else{
      nowCart = cart;
      return stripe.chargeForShop(cart.shop, 100, token, `Payment for cart ${cart._id}`);
    }

  }).then((charge) => {

    logging.info("Just charged :");
    logging.info(charge);


    //Once charged, we update the cart
    nowCart.isPaid = true;
    nowCart.chargeId = charge.id;
    return nowCart.save();

  }).then((cart) => {
    //Queue the fact to send a message + create a command + update the charge
    background.queuePaidCart(cart._id);

    res.send("charged");

  }).catch((err) => {
    res.send(err);
  })

};
