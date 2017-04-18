import config from 'config';
import Promise from 'bluebird';
import logging from '../lib/logging';
import rp from 'request-promise';

const stripe = require("stripe")(config.STRIPE_SECRET_KEY);

function chargeForShop(shop, amount, token, description){

  logging.info(shop.stripe.stripe_user_id);

  return new Promise((resolve, reject) => {
    const amountStripe = (amount * 10 * 100)/10;

    //Take a fee of 1% for us
    const fees = (amountStripe * config.APP_FEES);

    var options = {
      amount: amountStripe,
      currency: "eur",
      source: token,
      application_fee: fees
    };

    logging.info(options);

    //Charge for this shop
    stripe.charges.create(options, {
      stripe_account: shop.stripe.stripe_user_id,
    }).then((charge) => {
      resolve(charge);
    }).catch((err) => {
      reject(err);
    })

  });

}

/*
* When we have the order, we can update the charge with the order infos
*/

function updateChargeWithOrder(order){

  return new Promise((resolve, reject) => {

    if(!order.chargeId) reject(new Error("No charge id for this order"));
    const chargeId = order.chargeId;

    stripe.charges.update(chargeId, {
      description: `Payment for order ${order._id}`,
      metadata : {
        order_id : order._id.toString(),
        shop_id: order.shop._id.toString(),
        user_id: order.user._id.toString()
      }
    },{
      stripe_account: order.shop.stripe.stripe_user_id,
    }).then((charge) => {
      logging.info("Charge updated : ");
      logging.info(charge);
      resolve(charge);
    }).catch((err) => {
      reject(err);
    })


  })

}

module.exports = {
  chargeForShop,
  updateChargeWithOrder
};
