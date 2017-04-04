import _ from "lodash";
import logging from '../lib/logging';

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

exports.parseAccessTokenResponse = parseAccessTokenResponse;
exports.isJson = isJson;
