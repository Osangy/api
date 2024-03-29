import Analytics from 'analytics-node';
import config from 'config';
import logging from './logging';

const flush = process.env.NODE_ENV === "production" ? 20 : 1;
//logging.info("FLUSH");
//logging.info(flush);

let analytics = new Analytics(config.SEGMENT_BACKEND_WRITE_KEY, { flushAt: 1 });


function trackMessage(message){

  const event = message.isEcho ? "Send Message" : "Receive Message";
  const userId = message.shop.pageId
  const customerId = message.isEcho ? message.recipient.id : message.sender.id;
  const echoType = message.isEcho ? message.echoType : "standard";

  analytics.track({
    userId: userId,
    event: event,
    properties: {
      customerId: customerId,
      echoType: echoType
    }
  });
}

function trackNewCustomer(user){
  const event = "New Customer";


  analytics.track({
    userId: user.shop.toString(),
    event: event,
    properties: {
      customerId: user.id
    }
  });
}

function trackSellShop(order){


  analytics.track({
    userId: order.shop.pageId,
    event: "Sell",
    properties: {
      customerId: order.user.id,
      revenue: order.price,
      nbProducts: order.nbProducts,
      currency : "EUR",
      revenueType : "shops"
    }
  });

}

module.exports = {
   trackMessage,
   trackSellShop,
   trackNewCustomer
};
