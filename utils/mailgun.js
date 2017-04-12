import Mailgun from 'mailgun-js';
import config from 'config';
import logging from '../lib/logging';

function sendNewConversationMail(mail, message){

  let mailgun = new Mailgun({apiKey: config.MAILGUN_API_KEY, domain: config.MAILGUN_DOMAIN});

  var data = {
    from: config.MAILGUN_FROM_EMAIL,
    to: mail,
    subject: `New conversation with ${message.sender.firstName} ${message.sender.lastName}`,
    text: `${message.sender.firstName} ${message.sender.lastName} started a new conversation with your shop : "${message.text}"`
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
   sendNewConversationMail
};
