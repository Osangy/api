function parseAccessTokenResponse(response) {
  var afterParenthese = response.substr(response.indexOf("=") + 1);
  return afterParenthese
}

exports.parseAccessTokenResponse = parseAccessTokenResponse;
