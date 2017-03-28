import config from 'config';
import Promise from 'bluebird';
import { Shop, Message, Cart } from '../mongo/models';
import logging from '../lib/logging';
import moment from 'moment';
import facebook from './facebookUtils'
import _ from 'lodash';

Promise.promisifyAll(require("mongoose"));

function sendInfosAfterAddCart(variant, shop, customer, cart){

  const firstMessage = `${variant.product.title} - ${_.upperFirst(variant.type)} : ${_.upperCase(variant.value)}, d'un montant de ${variant.product.price}€, vient d'être ajouté à votre panier`;
  const secondMessage = `Votre panier contient maintenant ${cart.nbProducts} produit(s), pour un montant total de ${cart.totalPrice}€`;

  return new Promise((resolve, reject) => {

    facebook.sendMessage(shop, customer.facebookId, firstMessage, "addedProductCart").then(() => {
      return sendInfosCartState(shop, customer);
    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    })
  });


}


function sendInfosCartState(shop, customer){

  return new Promise((resolve, reject) => {

    Cart.findOne({shop : shop, user : customer}).populate('shop user').then((cart) => {

      if(!cart) reject(new Error("No cart for this user and this shop"));

      if(cart.nbProducts === 0){
        const message = `Votre panier est vide.`;
        return facebook.sendMessage(shop, customer.facebookId, message, "giveCartState");
      }
      else{
        const replies = [
          {
            content_type: "text",
            title: "Liste des produits",
            payload: config.PAYLOAD_INFOS_CART_LIST_PRODUCTS
          }
        ];
        const message = `Votre panier contient ${cart.nbProducts} produits, pour un montant total de ${cart.totalPrice}€`;
        return facebook.sendTextWithQuickReplies(shop, customer.facebookId, message, replies, "giveCartState");
      }

    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });


  });

}


function sendListPoductsCart(shop, customer){

  return new Promise((resolve, reject) => {

    Cart.findOne({shop : shop, user : customer}).populate('selections.variant').then((cart) => {

      if(!cart) reject(new Error("No cart for this user and this shop"));

      let message = '';
      cart.selections.forEach((selection) => {
        if(selection.quantity === 1){
          const newMessage = `* ${selection.variant.title} / Prix : ${selection.totalPriceVariant}€\n`;
          message += newMessage;
        }
        else{
          const newMessage = `* ${selection.variant.title}, en ${selection.quantity} exemplaires / Prix : ${selection.totalPriceVariant}€\n`;
          message += newMessage;
        }
      });


      logging.info(cart.selections[0].variant.type);
      return facebook.sendMessage(shop, customer.facebookId, message, "listProductsCart");

    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });


  });

}

module.exports = {
  sendInfosAfterAddCart,
  sendInfosCartState,
  sendListPoductsCart
};
