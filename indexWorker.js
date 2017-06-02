// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  var agent = require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start({ allowExpressions: true });
}
require("babel-register");
require("./worker/worker");
