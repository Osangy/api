import config from 'config';
import Promise from 'bluebird';
import { Shop, Message, Cart } from '../mongo/models';
import logging from '../lib/logging';
import moment from 'moment';
import rp from 'request-promise';
import facebook from './facebookUtils'
import _ from 'lodash';

Promise.promisifyAll(require("mongoose"));

function sendInfosAfterAddCart(variant, shop, customer, cart){

  const firstMessage = `👉 ${variant.getTitle()}, d'un montant de ${variant.price}€, vient d'être ajouté à votre panier 🛒`;

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
        const message = `Votre panier est vide. 😭`;
        return facebook.sendMessage(shop, customer.facebookId, message, "giveCartState");
      }
      else{
        const replies = [
          {
            content_type: "text",
            title: "Liste des produits 📦",
            payload: config.PAYLOAD_INFOS_CART_LIST_PRODUCTS
          }
        ];
        const message = `Votre panier contient ${cart.nbProducts} produit(s), pour un montant total de ${cart.totalPrice}€`;
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
          const newMessage = `✔️ ${selection.variant.getTitle()} / Prix : ${selection.totalPriceVariant}€\n`;
          message += newMessage;
        }
        else{
          const newMessage = `✔️ ${selection.variant.getTitle()}, en ${selection.quantity} exemplaires / Prix : ${selection.totalPriceVariant}€\n`;
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


function sendConfirmationPayment(shop, customer, cart){

  const confirmationMessage = `Merci, nous avons bien reçu votre paiement de ${cart.totalPrice}€`;

  return new Promise((resolve, reject) => {

    facebook.sendMessage(shop, customer.facebookId, confirmationMessage, "payConfirmation").then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    })

  });

}


function sendDeliveryUpdate(shop, customer, order){

  let messageDataText = {
    recipient: {
      id: customer.facebookId
    },
    message: {
      text: `Bonjour 🙌. Votre commande vient d'être envoyée 🎉`,
      metadata: "orderStatus"
    },
    tag: "SHIPPING_UPDATE"
  };

  let messageDataGif = {
    recipient: {
      id: customer.facebookId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: "https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif"
        }
      },
      metadata: "orderStatus"
    },
    tag: "SHIPPING_UPDATE"
  };


  return new Promise((resolve, reject) => {

    facebook.send(messageDataText, shop.pageToken).then(() => {
      return facebook.send(messageDataGif, shop.pageToken);
    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    })

  });

}


function sendActionWhenGetStarted(shop, futurRecipientId){

  return new Promise((resolve, reject) => {
    const messageData = {
      recipient: {
        id: futurRecipientId
      },
      message: {
        text: "Bienvenue 🙌. Comment pouvons nous vous aider ?",
        quick_replies: [
          {
            content_type: "text",
            title: "Infos produits ❔",
            payload: "GET_STARTED:INFOS"
          },
          {
            content_type: "text",
            title: "Idées cadeaux 🎁",
            payload: "GET_STARTED:GIFT"
          },
          {
            content_type: "text",
            title: "Après vente 🙊",
            payload: "GET_STARTED:SAV"
          },
          {
            content_type: "text",
            title: "Des bisous 😘",
            payload: "GET_STARTED:LOVE"
          }
        ]
      }
    };

    facebook.send(messageData, shop.pageToken).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });

  });


}

module.exports = {
  sendActionWhenGetStarted,
  sendInfosAfterAddCart,
  sendInfosCartState,
  sendListPoductsCart,
  sendConfirmationPayment,
  sendDeliveryUpdate
};
