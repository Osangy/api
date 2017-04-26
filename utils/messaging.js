import config from 'config';
import Promise from 'bluebird';
import { Shop, Message, Cart, Product } from '../mongo/models';
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

function sendProductInfos(shop, facebookId, productId, whatInfos){
  const arrayOfInfos = ["price","short","long", "morePhotos"];

  return new Promise((resolve,reject) => {
    if(arrayOfInfos.indexOf(whatInfos) < 0) reject(new Error("We don't manage this kind of infos"));

    Product.findById(productId).then((product) => {
      if(!product) reject(new Error("The is no product with this id"));

      let message = null;
      let images = null;
      switch (whatInfos) {
        case "price":
          message = `Le prix de "${product.title}" est de ${product.price}€`;
          break;
        case "short":
          message = `${product.shortDescription}`;
          break;
        case "long":
          message = _.replace(product.longDescription, /<p>/g, '');
          message = _.replace(message, /<\/p>/g, '\n');
          message = `ℹ️ Plus d'informations pour ${product.title} :\n\n` + message;
          break;
        case "morePhotos":
          if(product.images.length > 1){
            images = [];
            images.push(_.nth(product.images, 1));
            if(product.images.length > 2) images.push(_.nth(product.images, 2));
          }
          logging.info(images);
        default:

      }

      if(message){
        facebook.sendMessage(shop, facebookId, message, "sendInfos").then((message) => {
          resolve(message)
        }).catch((err) => {
          reject(err);
        });
      }
      else if(images){
        let imagesPromise = [];
        images.forEach((image) => {
          imagesPromise.push(facebook.sendImage(shop, facebookId, image));
        });
        Promise.all(imagesPromise).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        })
      }
      else{
        resolve();
      }

    })

  });


}


function sendProductsCarousel(shop, userFacebookId, products){


  let elements = [];
  products.map((product) => {
    let element = {
      title: product.title,
      image_url: product.images[0],
      subtitle: `Prix : ${product.price}€\n${product.shortDescription}`,
      buttons: [{
        type: "postback",
        title: "Plus d'infos 🤔",
        payload: `MORE_INFOS:${product.id}`
      }]
    };

    //More Photos action
    if(product.images.length > 1){
      element.buttons.push({
        type: "postback",
        title: "Plus de photos 📷",
        payload: `MORE_PHOTOS:${product.id}`
      });
    }

    //Add to cart action
    element.buttons.push({
      type: "postback",
      title: "Ajouter au panier 🛒",
      payload: `ADD_CART:${product.id}`
    });

    elements.push(element);
  })

  const messageData = {
    recipient: {
      id: userFacebookId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          image_aspect_ratio: "square",
          elements: elements
        }
      }
    }
  }

  return new Promise((resolve, reject) => {
    facebook.send(messageData, shop.pageToken).then((parsedBody) => {
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    })
  })

}

module.exports = {
  sendProductInfos,
  sendActionWhenGetStarted,
  sendInfosAfterAddCart,
  sendInfosCartState,
  sendListPoductsCart,
  sendConfirmationPayment,
  sendDeliveryUpdate,
  sendProductsCarousel
};
