import _ from "lodash";

function parseAccessTokenResponse(response) {
  var afterParenthese = response.substr(response.indexOf("=") + 1);

  return _.split(afterParenthese, '&', 1)[0];
}

exports.parseAccessTokenResponse = parseAccessTokenResponse;
