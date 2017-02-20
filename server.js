// Activate Google Cloud Trace and Debug when in production
if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug');
}

import express from "express";
import graphqlHTTP from "express-graphql";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql";
import bodyParser from 'body-parser';
import cors from 'cors';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { printSchema } from 'graphql/utilities/schemaPrinter';
import schema from './schema';
import routes from './routes';
import config from 'config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Promise from 'bluebird';
import morgan from 'morgan';
import passport from 'passport';
import { FacebookStrategy } from 'passport-facebook';
import * as AuthenticationController from './controllers/authentication';
import multer from 'multer';
import logging from './lib/logging';
var upload = multer({ dest: './uploads/' });

const passportService = require('./utils/passport');


const app = express();
app.set('port', (process.env.PORT || 3001));
app.set('view engine', 'pug');
app.set('views', './views');
app.use(express.static('files'));
app.use('*', cors());
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware to require login/auth
const requireAuth = passport.authenticate('jwt', { session: false });
const requireLogin = passport.authenticate('local', { session: false });

/*
* MONGO DB Connection
*/
Promise.promisifyAll(require("mongoose"));
mongoose.connect(config.mongo_url);
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


/*
* HEALTH CHECK FROM GOOGLE
*/

app.get('/_ah/health', (req, res) => {
  res.status(200).send('ok');
});

// Add the request logger before anything else so that it can
// accurately log requests.
app.use(logging.requestLogger);


/*
* Facebook API
*/
const facebookRoutes = express.Router();
facebookRoutes.use(bodyParser.json({ verify: verifyRequestSignature }));
facebookRoutes.get('/webhook', routes.facebook.webhookValidation);
facebookRoutes.get("/test", routes.facebook.sendTest);
facebookRoutes.get("/test/image", routes.facebook.sendTestImage);
facebookRoutes.get("/resub/:pageId", routes.facebook.reSub);
facebookRoutes.post('/webhook', routes.facebook.webhookPost);
app.use('/fb', facebookRoutes);

/*
* AUTH
*/

const authRoutes = express.Router();
authRoutes.get('/getPages', routes.facebook.accessPagesList);
authRoutes.post('/register', AuthenticationController.register);
authRoutes.post('/login', requireLogin, AuthenticationController.login);
app.use('/auth', authRoutes);


/*
* ADMIN INTERFACE
*/

const adminRoutes = express.Router();
adminRoutes.get('/import', routes.admin.importInterface);
adminRoutes.post('/uploadCatalog', upload.single('catalog'), routes.admin.uploadCatalog);
app.use('/admin', adminRoutes);


//TODO: STRIPE WEBHOOKS when user desauthorize
/*
* STRIPE
*/

const stripeRoutes = express.Router();
stripeRoutes.post('/', routes.stripe.base);
app.use('/stripe', stripeRoutes);


/*
* SHOP INTERFACE
*/

const shopRoutes = express.Router();
shopRoutes.get('/pay/:cartId', routes.shop.paySimple);
shopRoutes.post('/validatePayment', routes.shop.validatePayment);
app.use('/shop', shopRoutes);



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
    logging.error("Couldn't validate the signature.");
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

const apiRoutes = express.Router();
app.use('/api', apiRoutes);
apiRoutes.use(requireAuth);
apiRoutes.get('/test', function(req, res){
  res.send("OKKKKK");
})

apiRoutes.use('/graphql', bodyParser.json(), graphqlExpress(request => ({
  schema: schema,
  context: {
    pageId: config.page_id,
    user: request.user
  }
})));
apiRoutes.use('/graphiql', graphiqlExpress({
  endpointURL: '/api/graphql'
}));
app.use('/schema', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(printSchema(schema));
});


// Add the error logger after all middleware and routes so that
// it can log errors from the whole application. Any custom error
// handlers should go after this.
app.use(logging.errorLogger);


db.once('open', function() {
  logging.info("Connected to the database");

  app.listen(app.get('port'),() => logging.info(
    `Server running on port ${app.get('port')}`
  ));
});
