import _ from "lodash";
import logging from '../lib/logging';
import rp from 'request-promise';

function parseAccessTokenResponse(response) {
  if(response.access_token){
    return response.access_token
  }
  else{
    var afterParenthese = response.substr(response.indexOf("=") + 1);

    return _.split(afterParenthese, '&', 1)[0];
  }

}

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function completeAddress(shippingAddress){

  return new Promise((resolve, reject) => {
    const query = `${shippingAddress.address} ${shippingAddress.postalCode} ${shippingAddress.locality} ${shippingAddress.country}`;
    console.log(query);
    var options = {
      uri: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
      qs: {
        key: "AIzaSyAgFU6DKpNbfbrdNGdXYXV_LbcABEqjN_E",
        query: query
      },
      method: 'GET'
    }

    rp(options).then((parsedBody) => {
      console.log(parsedBody);
      logging.info(parsedBody);
      resolve(parsedBody);
    }).catch((err) => {
      reject(err);
    });
  });


}


module.exports = {
  parseAccessTokenResponse,
  isJson,
  completeAddress
};
