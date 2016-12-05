console.log({starting:true});

import express from "express";
import graphqlHTTP from "express-graphql";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql";
import bodyParser from 'body-parser';
import cors from 'cors';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { printSchema } from 'graphql/utilities/schemaPrinter';
import schema from './data/schema';
import routes from './routes';
import config from 'config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Promise from 'bluebird';

// const app = express().use('*', cors());
const app = express();
app.set('port', (process.env.PORT || 3001));
app.use(bodyParser.json({ verify: verifyRequestSignature }));

/*
* MONGO DB Connection
*/
Promise.promisifyAll(require("mongoose"));
mongoose.connect(config.mongo_url);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));



/*
* Facebook API
*/

app.get('/webhook', routes.facebook.webhookValidation);
app.post('/webhook', routes.facebook.webhookPost);

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 */

function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', config.appSecret)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}


/*
* GraphQL
*/

app.use('/graphql', bodyParser.json(), graphqlExpress({ schema: schema }));
app.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql',
}));
app.use('/schema', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(printSchema(schema));
});



db.once('open', function() {
  console.log("Connected to the database");

  app.listen(app.get('port'),() => console.log(
    `Server running on port ${app.get('port')}`
  ));
});
