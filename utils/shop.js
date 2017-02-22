import config from 'config';
import Promise from 'bluebird';
import { Shop, User, Cart, Order } from '../mongo/models';
import logging from '../lib/logging';
import rp from 'request-promise';
import facebook from './facebookUtils';
import stripe from './stripe';

Promise.promisifyAll(require("mongoose"));


//Function that sends a button to a conversation in order for the user to be able to validate his cart
function payCart(shop, cartId){

  return new Promise((resolve, reject) => {
    //Find the cart
    Cart.findById(cartId).populate('user').then((cart) => {

      if(!cart) reject(new Error("No cart with this id"));

      return facebook.sendButtonForPayCart(shop, cart.user.facebookId, cart);
    }).then((parsedBody) => {
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    });

  });

}


function processPaidCart(cartId){

  return new Promise((resolve, reject) => {
    let newOrder;

    Order.createFromCart(cartId).then((order) =>{
      newOrder = order;
      return stripe.updateChargeWithOrder(order);
    }).then((charge) => {

      return facebook.sendReceipt(newOrder);
    }).then((parsedBody) => {
      resolve(newOrder);
    }).catch((err) => {
      reject(err);
    })

  });

}

function validatePage(pageId){
  return new Promise((resolve, reject) => {
    let newOrder;

    Shop.findOne({pageId: pageId}).then((page) =>{
      if(!page) reject(new Error("This page does not exist"))
      resolve(page);
    }).catch((err) => {
      reject(err);
    })

  });
}

module.exports = {
  payCart,
  processPaidCart,
  validatePage
};
