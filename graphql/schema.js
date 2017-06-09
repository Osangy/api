import { schema as mongoSchema, resolvers as mongoResolvers } from '../mongo/schema';
import { makeExecutableSchema } from 'graphql-tools';
import { merge, reverse } from 'lodash';
import { User, Message, Conversation, Cart, Product, Variant, Shop, Order, Ad } from '../mongo/models';
import facebook from '../utils/facebookUtils';
import shop from '../utils/shop';
import messaging from '../utils/messaging';
import logging from '../lib/logging';
import Promise from 'bluebird';
import { pubsub } from './subscriptions';
import moment from 'moment';
import mongoose from 'mongoose';
import Ai from '../ai';

let ai = new Ai();

Promise.promisifyAll(require("mongoose"));

const rootSchema = [`
  enum StatusOrder {
    PAID
    SENT
    DELIVERED
  }

  input SelectionInput {
    # The product
    variant : ID!

    #The quantity
    quantity: Float!
  }

  input ClosedAutoInput {
    isActivated: Boolean!
    startHour: Float
    endHour: Float
    message: String
  }

  input AddressInput {
    recipientName: String
    address: String
    streetNumber : String!
    route : String!
    locality : String!
    region : String!
    country : String!
    postalCode : String!
    googleId: String!
  }

  type ShopErrorResponse {
    shop: Shop,
    error: String
  }

  type AdResponse {
    ad: Ad,
    error: String
  }

  type PurchasesInfo {
    nbOrders : Float!
    lastOrder : Order
  }

  type Query {

    #Infos about the shop
    shop: Shop

    # A list of message
    messages(limit:Int!, conversationId: String!, offset:Float) : [Message]

    # The list of conversations of a page_id
    conversations(limit: Int = 10): [Conversation]

    # The information about a user
    user(facebookId: String!): User

    # The products of a shop
    products(limit: Int = 10, searchString : String): [Product]

    #The variants of a product
    variants(product : ID!): [Variant]

    # The cart of a user
    cart(userId: ID!): Cart

    # The orders of a shop
    orders(limit : Int = 30): [Order]

    #The ads tracked for the shop
    ads(limit : Int = 30): [Ad]

    #The detail of an ad
    ad(adId: ID!) : Ad

    # The infos about all the purchases that the customer did
    purchasesInfos(userId: ID!) : PurchasesInfo
  }

  type Mutation {

    #Update infos about the shop
    updateShopInfos(timezone:String, closedAuto:ClosedAutoInput): ShopErrorResponse

    # A page send a message to a user
    sendMessage(text: String!, facebookId: String!): Message

    # A page send a message to a user
    sendImage(url: String!, facebookId: String!): Message

    # Add a product to the cart
    addCart(userId: String!, variantId: String!): Cart

    # Update the cart
    updateCart(userId: ID!, selections: [SelectionInput], shippingAddress : AddressInput): Cart

    # Connect to Stripe accounts
    stripeConnect(authorizationCode: String!): ShopErrorResponse

    # Send test button to webview
    payCart(cartId: ID!): Boolean

    #Send info about the cart to the customer
    sendCartInfos(userId:ID!): Boolean

    # Create a fake Cart
    createFakeCart(userId:ID!, price: Float): Cart

    # Update status of an orders
    updateStatusOrder(orderId: ID!, newStatus: StatusOrder!): Order

    #Set messages of a conversation as read
    setMessagesAsRead(conversationId: ID!): Conversation

    #Create a new Ad
    createFacebookAd(adId: String!): AdResponse

    #Update infos about a user
    updateUserInfos(userId:ID!, email:String!, phoneNumber:String!): User

    #Let the customer knows if user is typing
    agentTyping(userFacebookId:String!, typing:Boolean!): Boolean

    #Send a carousel
    sendCarousel(facebookId:String!):Boolean

    #Send a specific information about the product to the customer
    sendInfos(facebookId:String!, productId:ID!, whatInfos:String!):Message

    #Send products to the customer
    sendProducts(facebookId:String!, productIds:[ID]!):Boolean

    #Set Robot on or off
    setRobotActivity(conversation : ID!):Conversation

    # Init robot context
    initRobotContext(conversation : ID!): Conversation

  }

  type Subscription {
    # Subscription fires on new message
    messageAdded(shopId: ID!): Message

    # Subscription fires when cart has been modified
    cartModified(shopId: ID!): Cart

    # Subscription fires when cart has been modified
    conversationModified(shopId: ID!): Conversation
  }

  schema {
    query: Query
    mutation: Mutation
    subscription: Subscription
  }
`];


const rootResolvers = {
  Query: {
    shop(root, {}, context){
      return Promise.resolve()
        .then(() => (
          Shop.findById(context.user.id)
        ))
        .then((shop) => (
          shop
        ))
    },
    messages(root, {limit, conversationId, offset}, context) {
      logging.info("Querying Messages");
      const limitValidator = (limit > 100) ? 100 : limit;
      let messsagesToReturn;
      const offsetDate = offset ? (moment.unix(offset)).toDate() : moment();
      return Promise.resolve()
        .then(() => (
           Message.find({conversation: conversationId, timestamp:{"$lt" : offsetDate}}).sort({timestamp : -1}).populate("conversation").limit(limit)
        ))
        .then((messages) => {
          messsagesToReturn = reverse(messages);
          if(messages){
            let conversation = messages[0].conversation;
            if(conversation.nbUnreadMessages > 0){
              conversation.nbUnreadMessages = 0;
              pubsub.publish('newMessageInConversationChannel', conversation);
              return conversation.save();
            }
            else{
              return messsagesToReturn
            }
          }
          else{
            return messsagesToReturn;
          }
        })
        .then((conversation) =>(
          messsagesToReturn
        ))
    },
    conversations(root, { limit }, context){
      logging.info("Querying Conversations");
      const limitValidator = (limit > 20) ? 10 : limit;
      return Conversation.find({ shop: context.user._id}).sort({lastMessageDate : -1}).limit(limit);
    },
    user(root, { facebookId }, context){
      logging.info("Querying User");
      return User.findOne({ facebookId: facebookId });
    },
    products(root, { limit, searchString }, context){
      logging.info("Querying products");
      const limitValidator = (limit > 60) ? 60 : limit;

      if(!searchString){
        return Product.find({ shop: context.user._id}).limit(limit);
      }
      else{
        return Product.searchProducts(searchString, context.user, limit);
      }
    },
    variants(root, { product }, context){
      logging.info("Querying Variants");
      return Variant.find({ product: product}).limit(20);
    },
    cart(root, { userId }, context){
      logging.info("Querying Cart");
      return Cart.findOne({user: userId});
    },
    orders(root, {limit}, context){
      logging.info("Querying Orders");
      return Order.find({shop : context.user}).sort({createdAt : -1}).limit(limit);
    },
    ads(root, {limit}, context){
      logging.info("Querying Ads");
      return Ad.find({shop : context.user}).sort({createdAt : -1}).limit(limit);
    },
    purchasesInfos(root, {userId}, context){
      logging.info("Querying Purchases Infos");
      let ordersCount;
      return Promise.resolve()
        .then(() => (
            Order.find({shop : context.user, user : userId}).count()
        ))
        .then((count) => {
          ordersCount = count;
          return Order.find({shop : context.user, user : userId}).sort({createdAt : -1}).limit(1);
        })
        .then((orders) => {
          let lastOrder = orders.length > 0 ? orders[0] : null;
          return {
            nbOrders : ordersCount,
            lastOrder : lastOrder
          }
        });
    },
    ad(root, {adId}, context){
      return Promise.resolve()
        .then(() => (
          Ad.findOne({adId : adId})
        ))
        .then((ad) => (
          ad
        ))
    }
  },
  Mutation : {
    updateShopInfos(root,{timezone, closedAuto}, context){
      return new Promise((resolve, reject) => {
        if(!timezone && !closedAuto) resolve({
          shop: null,
          error: "Need at least one field to modify"
        });

        Shop.findById(context.user.id).then((shop) => {
          if(timezone) shop.timezone = timezone;
          else shop.closedAutoOption = closedAuto;

          return shop.save()
        }).then((shop) => {
          resolve({
            shop: shop,
            error: null
          });
        }).catch((err) => {
          resolve({
            shop: null,
            error: err.message
          });
        });
      })
    },
    sendMessage(root, {text, facebookId}, context){
      logging.info(`Mutation : An agent send : ${text} / to facebook Id : ${facebookId}`);
      return Promise.resolve()
        .then(() => (
           facebook.sendMessage(context.user, facebookId, text)
        ))
        .then((message) => (
          message
        ));
    },
    sendImage(root, {url, facebookId}, context){
      logging.info("Mutation : Send an Image");
      return Promise.resolve()
        .then(() => (
           facebook.sendImage(context.user, facebookId, url)
        ))
        .then((message) => (
          message
        ));
    },
    addCart(root, {userId, variantId}, context){
      logging.info("Mutation : Add Cart");
      return Promise.resolve()
        .then(() => (
           Cart.addProduct(variantId, context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    updateCart(root, {userId, selections, shippingAddress}, context){
      logging.info("Mutation : Update Cart");
      return new Promise((resolve, reject) => {
        if(selections){
          return Cart.updateCart(selections, context.user, userId).then((cart) => {
            resolve(cart);
          })
        }
        else if(shippingAddress){
          return Cart.updateShippingAddress(shippingAddress, context.user, userId).then((cart) => {
            resolve(cart);
          })
        }
        else{
          reject("Need to modify selections or shipping address")
        }
      });
    },
    stripeConnect(root, {authorizationCode}, context){
      logging.info("Mutation : Stripe Connect");
      return new Promise((resolve, reject) => {

        context.user.getStripeToken(authorizationCode).then((shop) => {
          resolve({
            shop: shop,
            errors: null
          });
        }).catch((err) => {
          console.log(err.message);
          resolve({
            shop: null,
            errors: err.message
          })
        });

      });
    },
    payCart(root, { cartId }, context){
      logging.info("Mutation : Pay Cart");
      return Promise.resolve()
        .then(() => (
           shop.payCart(context.user, cartId)
        ))
        .then((parsedBody) => (
          true
        ));
    },
    sendCartInfos(root, { userId }, context){
      logging.info("Mutation : Send Infos Cart");
      return Promise.resolve()
        .then(() => (
           User.findById(userId)
        ))
        .then((user) => (
          messaging.sendInfosCartState(context.user, user)
        ))
        .then(() => (
          true
        ));
    },
    createFakeCart(root, { userId, price }, context){
      return Promise.resolve()
        .then(() => (
           Cart.createFakeCart(context.user, userId)
        ))
        .then((cart) => (
          cart
        ));
    },
    updateStatusOrder(root, {orderId, newStatus}, context){
      return Promise.resolve()
        .then(() => {
          console.log(orderId);
          return Order.findById(orderId).populate("shop user");
        })
        .then((order) => (
          order.updateStatus(newStatus)
          //messaging.sendDeliveryUpdate(context.user, order.user, order)
        ))
        .then((order) => {
          console.log(order._id);
          return order;
        });
    },
    setMessagesAsRead(root, {conversationId}, context){
      return Promise.resolve()
        .then(() => {
          return Conversation.findById(conversationId)
        })
        .then((conversation) => {
          conversation.nbUnreadMessages = 0;
          pubsub.publish('newMessageInConversationChannel', conversation);
          return conversation.save();
        })
        .then((conversation) => {
          return conversation
        });
    },
    createFacebookAd(root, {adId}, context){
      return new Promise((resolve, reject) => {
        Ad.createFromFacebook(context.user, adId).then((ad) => {
          resolve({
            ad: ad,
            error: null
          });
        }).catch((err) => {
          resolve({
            ad: null,
            error: err.message
          });
        })
      });
    },
    updateUserInfos(root, {userId, email, phoneNumber}, context){
      return Promise.resolve()
        .then(() => {
          return User.findByIdAndUpdate(userId, {email : email, phoneNumber : phoneNumber}, {new: true});
        }).then((user) => (
          user
        ))
    },
    agentTyping(root, {userFacebookId, typing}, context){
      return Promise.resolve()
        .then(() => {
          if(typing) return facebook.sendAction(context.user, userFacebookId, "typing_on");
          else return facebook.sendAction(context.user, userFacebookId, "typing_off");
        })
        .then(() => (
          true
        ))
    },
    sendCarousel(root, {facebookId}, context){
      return Promise.resolve()
        .then(() => (
          messaging.sendProductsCarousel(context.user, facebookId, null)
        ))
        .then(() => (
          true
        ));
    },
    sendInfos(root, {facebookId, productId, whatInfos}, context){
      return Promise.resolve()
        .then(() => (
          messaging.sendProductInfos(context.user, facebookId, productId, whatInfos)
        ))
        .then((message) => (
          message
        ))
    },
    sendProducts(root, {facebookId, productIds}, context){
      return Promise.resolve()
        .then(() => {
          let ids = productIds.map((productId) => {
            return (new mongoose.Types.ObjectId(productId))
          });
          return Product.find({'_id': { $in: ids}});
        })
        .then((products) => (
          messaging.sendProductsCarousel(context.user, facebookId, products)
        ))
        .then(() => (
          true
        ))
    },
    setRobotActivity(root, {conversation}, context){
      return Promise.resolve()
        .then(() => (
          Conversation.findById(conversation)
        ))
        .then((conversationObject) =>{
          if(!conversationObject.isInRobotMode) conversationObject.isInRobotMode = true;
          else conversationObject.isInRobotMode = false;

          return conversationObject.save();
        })
        .then((conversationObject) => (
          conversationObject
        ))
    },
    initRobotContext(root, {conversation}, context){
      return Promise.resolve()
        .then(() => (
          Conversation.findById(conversation).populate('shop')
        ))
        .then((conversationObject) => {
          ai.initContext(conversationObject);
          return conversationObject
        })
    }
  },
  Subscription: {
    messageAdded(message) {
      return message;
    },
    cartModified(cart) {
      return cart;
    },
    conversationModified(conversation) {
      return conversation;
    },
  },
};


// Put schema together into one array of schema strings
// and one map of resolvers, like makeExecutableSchema expects
const schema = [...rootSchema, ...mongoSchema];
const resolvers = merge(rootResolvers, mongoResolvers);

const executableSchema = makeExecutableSchema({
  typeDefs: schema,
  resolvers,
});

export default executableSchema;
