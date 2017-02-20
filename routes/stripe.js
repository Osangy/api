import config from 'config';
import _ from 'lodash';
import Promise from 'bluebird';
import logging from '../lib/logging';


Promise.promisifyAll(require("mongoose"));

exports.base = function(req, res){
  res.send("OK");

};
