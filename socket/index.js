// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug').start();
}

var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
import logging from '../lib/logging';

app.use(function (req, res, next) {
  logging.info('middleware');
  req.testing = 'testing';
  return next();
});

app.get('/', function(req, res, next){
  logging.info('get route', req.testing);
  res.send("Ok");
});

app.ws('/', function(ws, req) {
  ws.on('message', function(msg) {
    logging.info(msg);
  });
  logging.info('socket', req.testing);
});

app.listen(8080, () => {
  console.log('App listening on port %s', 8080);
});
