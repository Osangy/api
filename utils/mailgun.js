import Mailgun from 'mailgun-js';
import config from 'config';
import logging from '../lib/logging';

function sendNewConversationMail(mail, message){

  let mailgun = new Mailgun({apiKey: config.MAILGUN_API_KEY, domain: config.MAILGUN_DOMAIN});

  let data = {};

  if(message){
    data = {
      from: config.MAILGUN_FROM_EMAIL,
      to: mail,
      subject: `New conversation with ${message.sender.firstName} ${message.sender.lastName}`,
      text: `${message.sender.firstName} ${message.sender.lastName} started a new conversation with your shop : "${message.text}"`
    };
  }
  else{
    data = {
      from: config.MAILGUN_FROM_EMAIL,
      to: mail,
      subject: `New conversation`,
      text: `A new conversation started. Hurry Up !! 🏃`
    };
  }

  return new Promise((resolve, reject) => {

    mailgun.messages().send(data, function (error, body) {
        if (error){
          logging.info("PROBLEM EMAIL");
          logging.info(error);
          reject(error);
        }
        else{
          logging.info("SENT EMAIL");
          logging.info(body);
          resolve(body);
        }
    });
  });

}

function sendNeedHumanMail(conversation){

  let mailgun = new Mailgun({apiKey: config.MAILGUN_API_KEY, domain: config.MAILGUN_DOMAIN});

  const data = {
    from: config.MAILGUN_FROM_EMAIL,
    to: conversation.shop.email,
    subject: `Need Human for ${conversation.user.firstName} ${conversation.user.lastName}`,
    text: `${conversation.user.firstName} ${conversation.user.lastName} need your help.`
  };



  return new Promise((resolve, reject) => {

    mailgun.messages().send(data, function (error, body) {
        if (error){
          logging.info("PROBLEM EMAIL");
          logging.info(error);
          reject(error);
        }
        else{
          logging.info("SENT EMAIL");
          logging.info(body);
          resolve(body);
        }
    });
  });

}

function sendNewOrder(order){
  let mailgun = new Mailgun({apiKey: config.MAILGUN_API_KEY, domain: config.MAILGUN_DOMAIN});

  const data = {
    from: config.MAILGUN_FROM_EMAIL,
    to: order.shop.email,
    subject: `New Order 💵`,
    text: `${order.user.firstName} ${order.user.lastName} just ordered products. The total ammount is ${order.price}€`
  };



  return new Promise((resolve, reject) => {

    mailgun.messages().send(data, function (error, body) {
        if (error){
          logging.info("PROBLEM EMAIL");
          logging.info(error);
          reject(error);
        }
        else{
          logging.info("SENT EMAIL");
          logging.info(body);
          resolve(body);
        }
    });
  });
}

module.exports = {
   sendNewConversationMail,
   sendNeedHumanMail,
   sendNewOrder
};
