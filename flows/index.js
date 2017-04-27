import config from 'config';
import Promise from 'bluebird';
import { Shop, Message, Conversation, Product, Variant, Cart } from '../mongo/models';
import logging from '../lib/logging';
import rp from 'request-promise';
import { pubsub } from '../graphql/subscriptions';
import background from '../lib/background';
import messaging from '../utils/messaging';
import _ from 'lodash';
import redis from '../utils/redis';

Promise.promisifyAll(require("mongoose"));

function startFlow(user, flowType, product, shop){

  const productsFlowTypes = ["addCart"];

  return new Promise((resolve, reject) => {

    let arrayFields = [];
    arrayFields.push('type');
    arrayFields.push(flowType);

    if(productsFlowTypes.indexOf(flowType) >= 0){
      arrayFields.push('product');
      arrayFields.push(product.id);

      if(product.hasColorVariants) {
        arrayFields.push('needColor');
        let colors = [];
        product.colors.forEach((color) => {
          colors.push(_.toLower(color));
        });
        arrayFields.push(_.join(colors, ':'));
      }
      if(product.hasSizeVariants) {
        arrayFields.push('needSize');
        let sizes = [];
        product.sizes.forEach((size) => {
          sizes.push(_.toLower(size));
        });
        arrayFields.push(_.join(sizes, ':'));
      }
    }
    logging.info(arrayFields);

    stopAnyFlow(user).then(() => {
      return redis.getClient().hmsetAsync(`flow:${user.id}`, arrayFields);
    }).then((res) => {
      return manageFlowNextStep(user, shop, product);
      // if(product.hasColorVariants) return messaging.chooseProductColor(shop, user, product);
      // else if(product.hasSizeVariants) return messaging.chooseProductSize(shop, user, product);
      // throw "noVariants"
    }).then(() => {
      resolve();
    }).catch((err) => {
      if(err === "noVariants") resolve();
      else reject(err);
    });

  });

}

function stopAnyFlow(user){
  return new Promise((resolve, reject) => {

    redis.getClient().delAsync(`flow:${user.id}`).then((res) => {
      resolve(res)
    }).catch((err) => {
      reject(err);
    })

  });
}

function getFlow(user){

  return new Promise((resolve, reject) => {

    redis.getClient().hgetallAsync(`flow:${user.id}`).then((res) => {
      resolve(res);
    }).catch((err) => {
      reject(err);
    })

  });


}

function getActualFlow(user){
  return new Promise((resolve, reject) => {

    redis.getClient().hgetallAsync(`flow:${user.id}`).then((res) => {
      logging.info(res);
      resolve(res)
    }).catch((err) => {
      reject(err);
    })

  });
}

function manageFlow(message){

  const user = message.sender;

  return new Promise((resolve, reject) => {

    getActualFlow(user).then((res) => {
      if(!res) throw "noflow"

      if(res.type === "addCart") return manageAddCart(user, res, message);
      else throw 'noflow';
      //return stopAnyFlow(user);
    }).then((res) => {
      resolve(res);
    }).catch((err) => {
      if(err === "noflow") resolve();
      else reject(err);
    });

  });
}

function manageAddCart(user, actualFlow, message){
  return new Promise((resolve, reject) => {

    Product.findById(actualFlow.product).then((product) => {
      if(!product) throw (new Error("No product with this id"));

      if(_.toUpper(message.text) === "STOP"){
        return stopAnyFlow(user);
      }

      if(actualFlow.needColor && !actualFlow.color){
        return manageNeedColor(user, actualFlow, message, product);
      }
      else if(actualFlow.needSize && !actualFlow.size){
        return manageNeedSize(user, actualFlow, message, product);
      }
      else return finishAddCart(message.shop, user, product, actualFlow);


    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    })
  });
}

function manageNeedColor(user, actualFlow, message, product){
  return new Promise((resolve, reject) => {

    const potentialColors = _.split(actualFlow.needColor,':');
    const text = _.toLower(message.text);
    if(potentialColors.indexOf(text) < 0 ){
      manageFlowNextStep(user, message.shop, product).then(() => {
        resolve()
      }).catch((err) => {
        reject(err);
      });
    }
    else{
      logging.info(`We have our color : ${text}`);
      redis.getClient().hmsetAsync(`flow:${user.id}`, ['color', text]).then(() => {
        if(!actualFlow.needSize) throw "noSize"
        return manageFlowNextStep(user, message.shop, product);
      }).then(() => {
        resolve();
      }).catch((err) => {
        if(err === "noSize") resolve();
        reject(err);
      })
    }
  });
}

function manageNeedSize(user, actualFlow, message, product){
  return new Promise((resolve, reject) => {

    const potentialSizes = _.split(actualFlow.needSize,':');
    const text = _.toLower(message.text);
    if(potentialSizes.indexOf(text) < 0 ){
      manageFlowNextStep(user, message.shop, product).then(() => {
        resolve()
      }).catch((err) => {
        reject(err);
      });
    }
    else{
      logging.info(`We have our size : ${text}`);
      redis.getClient().hmsetAsync(`flow:${user.id}`, ['size', text]).then(() => {
        return manageFlowNextStep(user, message.shop, product);
      }).then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      })
    }
  });
}

function finishAddCart(shop, user, product, flow){
  logging.info(`We add this flow to the cart ${flow.toString()}`);

  return new Promise((resolve, reject) => {
    let variantSearch = {
      product: product,
    };

    if(flow.needColor) variantSearch.lowerColor = flow.color;
    if(flow.needSize) variantSearch.lowerSize = flow.size;

    logging.info(variantSearch);
    Variant.findOne(variantSearch).then((variant) => {
      if(!variant) throw new Error("No variant found with these infos");
      logging.info(`Variant found ${variant.toString()}`);
      return Cart.addProduct(variant.id, shop, user.id);
    }).then(() => {
      return stopAnyFlow(user);
    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    });

  });
}

function manageFlowNextStep(user, shop, product){
  return new Promise((resolve, reject) => {

    getActualFlow(user).then((flow) => {
      if(flow.needColor && !flow.color) return messaging.chooseProductColor(shop, user, product);
      else if(flow.needSize && !flow.size) return messaging.chooseProductSize(shop, user, product);
      else return finishAddCart(shop, user, product, flow);
    }).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
    })

  });
}

module.exports = {
  startFlow,
  getFlow,
  manageFlow
};
