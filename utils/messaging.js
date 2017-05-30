import config from 'config';
import Promise from 'bluebird';
import { Shop, Message, Cart, Product, User } from '../mongo/models';
import logging from '../lib/logging';
import moment from 'moment';
import facebook from './facebookUtils'
import _ from 'lodash';

Promise.promisifyAll(require("mongoose"));

function sendInfosAfterAddCart(variant, shop, customer, cart){

  const firstMessage = `👉 ${variant.getTitle()}, d'un montant de ${variant.price}€, vient d'être ajouté à ton panier 🛒`;

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
        // const replies = [
        //   {
        //     content_type: "text",
        //     title: "Liste des produits 📦",
        //     payload: config.PAYLOAD_INFOS_CART_LIST_PRODUCTS
        //   }
        // ];
        const apiPayUrl = `${config.serverURL}shop/pay/${cart.id}`;
        const message = `Ton panier contient ${cart.nbProducts} produit(s), pour un montant total de ${cart.totalPrice}€`;
        const messageData = {
          recipient: {
            id: customer.facebookId
          },
          message: {
            metadata:'giveCartState',
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: message,
                buttons: [
                  {
                    type:'postback',
                    title:'Détail produits 📦',
                    payload:config.PAYLOAD_INFOS_CART_LIST_PRODUCTS
                  },
                  {
                    type: "web_url",
                    url: apiPayUrl,
                    title: 'Valider panier 🙌🏼',
                    messenger_extensions : true,
                    fallback_url : apiPayUrl
                  }
                ]
              }
            }
          }
        }

        return facebook.send(messageData, shop.pageToken);
        //return facebook.sendTextWithQuickReplies(shop, customer.facebookId, message, replies, "giveCartState");
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
      if(cart.selections.length == 0) {
        const message = `Votre panier est vide. 😭`;
        return facebook.sendMessage(shop, customer.facebookId, message, "listProductsCart");
      }

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

      const apiPayUrl = `${config.serverURL}shop/pay/${cart.id}`;
      const messageData = {
        recipient: {
          id: customer.facebookId
        },
        message: {
          metadata:'listProductsCart',
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: message,
              buttons: [
                {
                  type: "web_url",
                  url: apiPayUrl,
                  title: 'Valider panier 🙌🏼',
                  messenger_extensions : true,
                  fallback_url : apiPayUrl
                }
              ]
            }
          }
        }
      }
      return facebook.send(messageData, shop.pageToken);
      //return facebook.sendMessage(shop, customer.facebookId, message, "listProductsCart");
    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });


  });

}


function sendConfirmationPayment(shop, customer, cart){

  const confirmationMessage = `Merci, nous avons bien reçu ton paiement de ${cart.totalPrice}€`;

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
      text: `Bonjour 🙌. Ta commande vient d'être envoyée 🎉`,
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
        text: "Bienvenue 🙌. Comment pouvons nous  t'aider ?",
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
      if(!product) throw new Error("The is no product with this id");

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
        const replies = [{
          content_type:'text',
          title: 'Ajouter au panier 🛒',
          payload: `ADD_CART:${product.id}`
        }];
        return facebook.sendTextWithQuickReplies(shop, facebookId, message, replies, "sendInfos");
        // facebook.sendMessage(shop, facebookId, message, "sendInfos").then((message) => {
        //   resolve(message)
        // }).catch((err) => {
        //   reject(err);
        // });
      }
      else if(images){
        let imagesPromise = [];
        images.forEach((image) => {
          imagesPromise.push(facebook.sendImage(shop, facebookId, image));
        });
        //return Promise.all(imagesPromise);
        Promise.all(imagesPromise).then(() => {
          const replies = [{
            content_type:'text',
            title: 'Ajouter au panier 🛒',
            payload: `ADD_CART:${product.id}`
          }];
          const message = "Tu peux à présent ajouter le produit à ton panier en cliquant ci-dessous 👇👇👇"
          return facebook.sendTextWithQuickReplies(shop, facebookId, message, replies, "sendInfos");
        }).catch((err) => {
          throw err;
        })
      }
      else{
        throw new Error("We are not able to manage this kind of infos to send");
      }

    }).then(() => {

    })

  });


}


function sendProductsCarousel(shop, userFacebookId, products){


  let elements = [];
  let productsId = [];
  products.map((product) => {

    productsId.push(product.id);

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

      //Save the fact that we offered this product to this user
      return User.findOne({facebookId : userFacebookId});
    }).then((user) => {
      if(!user) throw "nouser";

      logging.info(productsId);

      if(!user.offeredProducts) user.offeredProducts = productsId;
      else{
        const newOfferedProducts = _.union(user.offeredProducts, productsId);
        user.offeredProducts = newOfferedProducts;
      }

      return user.save();
    }).then((user) => {
      resolve();
    }).catch((err) => {
      if(err === "nouser") resolve();
      reject(err);
    })
  })

}

function chooseProductColor(shop, user, product){

  return new Promise((resolve, reject) => {

    const messageData = {
      recipient: {
        id: user.facebookId
      },
      message: {
        text: `Choisis une couleur dans laquelle tu souhaites "${product.title}". (Envoie STOP si tu ne souhaites plus ce produit)`,
        metadata: 'flow:color',
        quick_replies: []
      }
    };

    product.colors.forEach((color) => {
      messageData.message.quick_replies.push({
        content_type: "text",
        title: `${color}`,
        payload: `COLOR:${color}`
      })
    })

    facebook.send(messageData, shop.pageToken).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });

  });
}

function chooseProductSize(shop, user, product){

  return new Promise((resolve, reject) => {

    const messageData = {
      recipient: {
        id: user.facebookId
      },
      message: {
        text: `Choisis une taille dans laquelle tu souhaites "${product.title}". (Envoie STOP si tu ne souhaites plus ce produit)`,
        metadata: 'flow:size',
        quick_replies: []
      }
    };

    product.sizes.forEach((size) => {
      messageData.message.quick_replies.push({
        content_type: "text",
        title: `${size}`,
        payload: `SIZE:${size}`
      });
    });

    facebook.send(messageData, shop.pageToken).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });

  });
}

module.exports = {
  chooseProductSize,
  chooseProductColor,
  sendProductInfos,
  sendActionWhenGetStarted,
  sendInfosAfterAddCart,
  sendInfosCartState,
  sendListPoductsCart,
  sendConfirmationPayment,
  sendDeliveryUpdate,
  sendProductsCarousel
};
