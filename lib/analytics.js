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
  const customerId = message.isEcho ? message.recipient._id : message.sender._id;

  analytics.track({
    userId: userId,
    event: event,
    properties: {
      customerId: customerId
    }
  });
}

function trackSellShop(order){


  analytics.track({
    userId: order.shop.pageId,
    event: "Sell",
    properties: {
      customerId: order.user._id,
      revenue: order.price,
      nbProducts: order.nbProducts,
      currency : "EUR"
    }
  });

}

module.exports = {
   trackMessage,
   trackSellShop
};
