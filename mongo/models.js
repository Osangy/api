import mongoose from 'mongoose';
import Promise from 'bluebird';
import { getFacebookUserInfos, sendMessage } from '../utils/facebookUtils';
import moment from 'moment';
import _ from 'lodash';
import logging from '../lib/logging';
import background from '../lib/background';
import rp from 'request-promise';
import config from 'config';
import autoIncrement from 'mongoose-auto-increment';
import { pubsub } from '../graphql/subscriptions';
import randtoken from 'rand-token';
import analytics from '../lib/analytics';

const bcrypt = Promise.promisifyAll(require("bcrypt-nodejs"));
Promise.promisifyAll(require("mongoose"));


let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

const addressSchema = mongoose.Schema({
  streetNumber : String,
  route: String,
  locality: String,
  region : String,
  country: String,
  postalCode : String,
  googleId : String
});

/*
* USER SCHEMA
*/

const UserSchema = mongoose.Schema({
    facebookId: String,
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    firstName: String,
    lastName: String,
    profilePic: String,
    locale: String,
    timezone: Number,
    gender: String,
    lastShippingAddress : addressSchema,
    lastUpdate: Date
}, {
  timestamps: true
});

UserSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
});

//After a message save we increment the nb of message of the conversation
UserSchema.post('save', function(message) {
  if(this.wasNew){
    analytics.trackNewCustomer(this);
    let cart = new Cart({
      shop : this.shop,
      user : this
    });
    cart.save();

  }

});


  /*
  * Find a user, if does not exist create it
  */

UserSchema.statics.createOrFindUser = function(user_id, shop){
    return new Promise(function(resolve, reject){

      User.findOne({facebookId : user_id}).then(function(user){

        if(user){
          resolve(user);
        }
        else{
          logging.info("User NOT found");
          User.createFromFacebook(user_id, shop).then(function(user){
            resolve(user);
          }).catch(function(err){
            reject(err);
          });

        }

      }).catch(function(err){
        reject(err);
      });

    })
  }

  /*
  * Create a user from the Facebook infos
  */

UserSchema.statics.createFromFacebook = function(user_id, shop){

    return new Promise(function(resolve, reject){

      getFacebookUserInfos(shop, user_id).then(function(userJson){

        let user = new User({facebookId : user_id});
        if(userJson.first_name) user.firstName = userJson.first_name;
        if(userJson.last_name) user.lastName = userJson.last_name;
        if(userJson.profile_pic) user.profilePic = userJson.profile_pic;
        if(userJson.locale) user.locale = userJson.locale;
        if(userJson.timezone) user.timezone = userJson.timezone;
        if(userJson.gender) user.gender = userJson.gender;

        user.shop = shop;

        return user.save();
      }).then((user) => {
        resolve(user);
      }).catch(function(err){
        logging.error(err);
        reject(err);
      });
    });

  }


//================================
// Shop Schema
//================================
const ShopSchema = new Schema({
    email: {
      type: String,
      lowercase: true,
      unique: true,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    shopName: {
      type: String,
      required: true
    },
    stripe: {
      token_type : String,
      stripe_publishable_key: String,
      scope: String,
      livemode: Boolean,
      stripe_user_id: String,
      refresh_token: String,
      access_token: String
    },
    shopUrl: { type: String },
    pageId: { type: String },
    pageToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
  },
  {
    timestamps: true
});

// Pre-save of user to database, hash password if password is modified or new
ShopSchema.pre('save', function(next) {
    const shop = this,
          SALT_FACTOR = 5;

    if (!shop.isModified('password')) return next();

    bcrypt.genSalt(SALT_FACTOR, function(err, salt) {
      if (err) return next(err);

      bcrypt.hash(shop.password, salt, null, function(err, hash) {
        if (err) return next(err);
        shop.password = hash;
        next();
      });
    });
});

// Method to compare password for login
ShopSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
      if (err) { return cb(err); }

      cb(null, isMatch);
    });
}

ShopSchema.methods.getStripeToken = function(authorizationCode){

    const shop = this;

    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        uri: 'https://connect.stripe.com/oauth/token',
        body: {
            client_secret: config.STRIPE_TEST_SECRET_KEY,
            code: authorizationCode,
            grant_type: "authorization_code",
            client_id: config.STRIPE_DEV_CLIENT_ID
        },
        json: true // Automatically stringifies the body to JSON
    };

      rp(options).then((parsedBody) => {
        logging.info("Got response auth from stripe : ");
        logging.info(parsedBody);
        if(parsedBody.access_token){
          _.forIn(parsedBody, (value, key) => {
            shop.stripe[key] = value;
          });
        }

        return shop.save();

      }).then((shop) => {
        resolve(shop);
      }).catch((err) => {
        reject(err);
      })


    });

}


  /*
  * PRODUCTS SCHEMA
  */

const ProductSchema = mongoose.Schema({
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    reference: {
      type: String,
      required: true
    },
    title : {
      type: String,
      required: true
    },
    shortDescription : String,
    longDescription : String,
    categories : [String],
    images : [String],
    price: Number
  });

ProductSchema.statics.createProduct = function(data, shop){



  return new Promise(function(resolve, reject){

    let finalProduct;

    if(!data.reference){
      reject(new Error("The product has no reference"));
    }

    //We verify if the product does not already exist
    Product.findOne({ reference : data.reference, shop : shop}).then(function(product){
      if(product){
        reject(new Error("This product already exists"));
      }

      if(!data.title) reject(new Error("The product has no title"));

      let newProduct = new Product({
        shop: shop,
        reference : data.reference,
        title: data.title,
        images: data.images.split(","),
        price: data.price,
      });

      if(data.shortDescription) newProduct.shortDescription = data.shortDescription;
      if(data.longDescription) newProduct.longDescription = data.longDescription;
      if(data.categories) newProduct.categories = data.categories.split(",");


      return newProduct.save();
    }).then(function(product){

      finalProduct = product;

      const sizes = data.sizes.split(",");
      let variants = [];
      if(sizes.length > 0){
        sizes.forEach(function(size) {
          variants.push(Variant.createVariantSize(product, size));
        });
      }
      else{
        //TODO: If no size, create a unique size
        resolve(finalProduct);
      }

      return Promise.all(variants)

    }).then(function(){
      resolve(finalProduct);
    }).catch(function(error){
      reject(error);
    })

  });


}


ProductSchema.statics.searchProducts = function(searchString, shop, limit){

  console.log("searchString");

  let andSearch = [];
  _.split(searchString, " ").map((word) => {
    andSearch.push({title : { "$regex" : '.*'+word+'.*', "$options" : "i" } })
  });

  logging.info(andSearch);

  return new Promise((resolve, reject) => {
    Product.find({ shop : shop, "$and" : andSearch}).limit(limit).then((products) => {
      resolve(products);
    }).catch((err) => {
      reject(err);
    })
  });



}

/*
* VARIANTS SCHEMA
*/

const VariantSchema = mongoose.Schema({
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    type : String,
    value: String
});

VariantSchema.statics.createVariantSize = (product, size) => {

  return new Promise(function(resolve, reject){

    let newVariant = new Variant({
      product: product,
      type: "size",
      value: size
    });

    newVariant.save().then((variant) => {
      resolve(variant);
    }).catch((err) => {
      reject(err);
    })

  });
}

VariantSchema.statics.createVariant = (data, shop) => {

  return new Promise(function(resolve, reject){


    Product.findOne({reference : data.reference}).then((product) => {
      if(!product){
        reject(new Error("No productg found for this reference"));
      }
      else{

        let newVariant = new Variant({
          shop: shop,
          product: product,
          reference: data.variantReference,
        });
        if(data.images) newVariant.images = data.images.split(',');
        if(data.size) newVariant.size = data.size;
        if(data.color) newVariant.color = data.color;
        if(data.price) newVariant.price = data.price;
        if(data.stock) newVariant.stock = data.stock;

        return newVariant.save();
      }
    }).then((variant) => {
      resolve(variant);
    }).catch((error) => {
      reject(error);
    });

  });
}



  /*
  * MESSAGE SCHEMA
  */

const buttonSchema = mongoose.Schema({
  type : String,
  url: String,
  title: String
});

const attachmentSchema = mongoose.Schema({
  type : String,
  payload : {
    url : String,
    template_type : String,
    text : String,
    buttons : [buttonSchema]
  }
});

const MessageSchema = mongoose.Schema({
    mid: {
      type: String,
      unique: true
    },
    text: String,
    isEcho: Boolean,
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'file', 'location']
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    fileUrl: String,
    coordinates:{
      lat: Number,
      long: Number
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    echoType: {
        type: String,
        enum: ['standard', 'askPayCart', 'payConfirmation', 'receipt', 'orderStatus']
    },
    attachments : [attachmentSchema]
  },
  {
    timestamps: true
  });

MessageSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
});

//After a message save we increment the nb of message of the conversation
MessageSchema.post('save', function(message) {
  if(this.wasNew){
    analytics.trackMessage(this);
    Conversation.findById(message.conversation).then((conversation) => {
      conversation.nbMessages++;
      if(!message.isEcho){
        conversation.nbUnreadMessages++;
      }
      conversation.lastMessageDate = moment();
      return conversation.save();
    }).then((conversation) => {
      pubsub.publish('newConversationChannel', conversation);
    }).catch((err) => {
      console.error("Problem updating conversation messages info");
      console.error(err.message);
    });
  }

});


/*
* Create a new message entry
*/

MessageSchema.statics.createFromFacebook = (messageObject, shop) => {

  //See if the emssage was sent by the page or the user
  let user_id = (messageObject.message.is_echo) ? messageObject.recipient.id : messageObject.sender.id
  let user;


  return new Promise(function(resolve, reject){

    //See if user exists, or create one
    User.createOrFindUser(user_id, shop).then(function(userObject){

      user = userObject;

      //See if conversation exists, or create one
      return Conversation.findOrCreate(userObject, shop);
    }).then(function(conversationObject){


      //Create the message
      let message = new Message({
        isEcho : (messageObject.message.is_echo) ? true : false,
        conversation : conversationObject,
        timestamp : moment(messageObject.timestamp),
        mid: messageObject.message.mid,
        shop: shop
      });

      //Set the right user kind
      if(messageObject.message.is_echo){
        message.recipient = user;
      }
      else{
        message.sender = user;
      }

      if(messageObject.message.text){
        message.text = messageObject.message.text;
      }

      if(messageObject.message.attachments){
        message.manageAttachments(messageObject.message.attachments);
      }

      if(messageObject.message.metadata){
        message.echoType = messageObject.message.metadata;
      }

      //TODO : increment message counter and date in conversation
      return message.save();
    }).then(function(message){
      resolve(message);
    }).catch(function(err){
      reject(err);
    });

  });

}


MessageSchema.statics.createFromShopToFacebook = (type, content, userFacebookId, shop) => {
  return new Promise(function(resolve, reject){

    let user;
    //See if user exists, or create one
    User.findOne({facebookId : userFacebookId}).then(function(userObject){

      if(!userObject) reject(new Error("No user found"))

      user = userObject;

      //See if conversation exists, or create one
      return Conversation.findOne({shop : shop, user : user});
    }).then(function(conversationObject){

      if(!conversationObject) reject(new Error("The conversation was not found"));


      //Create the message
      let message = new Message({
        isEcho : true,
        conversation : conversationObject,
        recipient: user,
        timestamp: moment(),
        shop: shop
      });

      switch (type) {
        case 'text':
          message.text = content;
          break;
        case 'image':
          let newAttachment = {
            type : "image",
            payload : {
              url : content
            }
          };
          message.attachments = [newAttachment];
        default:

      }

      resolve(message);
    }).catch(function(err){
      reject(err);
    });

  });
}


MessageSchema.statics.createFromFacebookEcho = (messageObject, shop) => {

  return new Promise((resolve, reject) => {

    //Find a message with this mid
    Message.findOne({ mid: messageObject.message.mid }).populate("conversation").then((message) => {

      //Update message if we already have it in the database
      if(message){
        message.timestamp = moment(messageObject.timestamp);
        return message.save();
      }
      //Otherwise we create it as a new one
      else{
        return Message.createFromFacebook(messageObject, shop);
      }

    }).then((message) => {
      resolve(message);
    }).catch((err) => {
      reject(err);
    })

  });

}

MessageSchema.methods.manageAttachments = function(attachments){

  this.attachments = [];
  let position = 0;
  attachments.forEach((attachment) => {

    let newAttachment = {};
    //TODO: Manage Multiple Attachments
    switch (attachment.type) {
      case 'audio':
      case "image":
      case "video":
      case "file":
        newAttachment.type = attachment.type;
        newAttachment.payload = {
          url : attachment.payload.url
        };
        background.queueFile(newAttachment.payload.url, this.mid, position);
        break;
      case "location":
        message.type = messageObject.message.attachments[0].type;
        message.coordinates.lat = messageObject.message.attachments[0].payload.coordinates.lat
        message.coordinates.long = messageObject.message.attachments[0].payload.coordinates.long
        break;
      case "template":
        newAttachment.type = attachment.type;
        let payload = {};
        switch (attachment.payload.template_type) {
          case "button":
            payload.template_type = attachment.payload.template_type;
            payload.text = attachment.payload.text;
            payload.buttons = [];
            attachment.payload.buttons.forEach((button) => {

              if(button.type === "web_url"){
                payload.buttons.push(button)
              }

            })
            break;
          default:

        }
        newAttachment.payload = payload;
      default:
    }
    this.attachments.push(newAttachment);
    position++;
  });

}


  /*
  * CONVERSATION SCHEMA
  */

  const ConversationSchema = mongoose.Schema({
      shop: {
        type: Schema.Types.ObjectId,
        ref: 'Shop',
        index: true
      },
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true
      },
      nbMessages: {
        type: Number,
        default: 0
      },
      nbUnreadMessages: {
        type: Number,
        default: 0
      },
      lastMessageDate: Date
    },
    {
      timestamps: true
    });

  /*
  * Find a conversation, or create if it does not exists.
  */

  ConversationSchema.statics.findOrCreate = function(user, shop){

    return new Promise(function(resolve, reject){
      Conversation.findOne({ shop: shop._id, user: user._id}).then(function(conversation){

        if(conversation){
          resolve(conversation);
        }
        else{
          logging.info("NOT found a conversation, need to create one");
          conversation = new Conversation({ shop : shop, user : user});

          conversation.save().then(function(conversation){
            resolve(conversation);
          }).catch(function(err){
            reject(err);
          });
        }

      }).catch(function(err){
        reject(err);
      });

    });


  }


/*
* CART SCHEMA
*/

const CartSchema = mongoose.Schema({
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    selections : [{
      variant: {
        type: Schema.Types.ObjectId,
        ref: 'Variant'
      },
      quantity: Number,
      totalPriceVariant: Number
    }],
    totalPrice: Number,
    nbProducts: Number,
    chargeId: String,
    chargeDate: Date,
    charge: String,
    shippingAddress : addressSchema,
    isPaid: {
      type: Boolean,
      default: false
    },
    ask_payment_token : String
  },
  {
    timestamps: true
});

CartSchema.statics.createFakeCart = function(shop, userId, price = 100){

  return new Promise((resolve, reject) => {

    let persistentUser;

    User.findById(userId).then((user) => {
      if(!user) reject(new Error("No user with this id"));
      persistentUser = user;
      Cart.findOne({user : user, shop : shop});
    }).then((cart) => {

      if(!cart){
        let newCart = new Cart({
          shop: shop,
          user: persistentUser,
          totalPrice: price,
          nbProducts: 3
        });

        return newCart.save();
      }
      else{
        cart.totalPrice = price;
        cart.nbProducts = 2;
        return cart.save();
      }


    }).then((cart) => {
      resolve(cart);
    }).catch((err) => {
      reject(err);
    })
  })

}

CartSchema.statics.addProduct = function(variantId, shop, userId){


  return new Promise(function(resolve, reject){
    let user;
    let variant;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Variant.findById(variantId).populate('product');
    }).then(function(variantFound){
      if(!variantFound) reject(new Error("No variant with this id"))

      variant = variantFound
      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){

      //There is already a cart
      if(cart){

        let foundOne = false;
        _.forEach(cart.selections, function(value) {
            if(variant.equals(value.variant)){
              foundOne = true;
              value.quantity++;
              value.totalPriceVariant += variant.product.price;
              return false;
            }
        });

        if(!foundOne){
          cart.selections.push({
            variant: variant,
            quantity: 1,
            totalPriceVariant: variant.product.price
          });
        }

        cart.cleanSelections();

        return cart.save();
      }
      //Toherwise we create one
      else{

        let newCart = new Cart({
          shop : shop,
          user: user,
          selections: [],
          totalPrice: 0,
          nbProducts: 0
        });

        newCart.selections.push({
          variant: variant,
          quantity: 1,
          totalPriceVariant: variant.product.price
        });

        newCart.cleanSelections();

        return newCart.save();
      }


    }).then(function(cart){

      resolve(cart);
    }).catch(function(error){

      reject(error);
    });


  });


}


CartSchema.statics.updateCart = function(selections, shop, userId){


  return new Promise(function(resolve, reject){
    let user;
    let variant;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){
      if(cart){

        _.forEach(selections, (selection) => {
          cart.updateSelection(selection);
        })

        cart.cleanSelections();

        return cart.save();
      }
      //Toherwise we create one
      else{
        reject(new Error("No cart for this user, so we are not able to remove any products from it"))
      }


    }).then(function(cart){

      resolve(cart);
    }).catch(function(error){

      reject(error);
    });

  });
}

CartSchema.statics.updateShippingAddress = function(shippingAddress, shop, userId){


  return new Promise(function(resolve, reject){
    let user;
    let variant;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){
      if(cart){

        cart.shippingAddress = shippingAddress
        return cart.save();
      }
      //Toherwise we create one
      else{
        reject(new Error("No cart for this user, so we are not able to remove any products from it"))
      }


    }).then(function(cart){

      resolve(cart);
    }).catch(function(error){

      reject(error);
    });

  });
}


CartSchema.methods.updateSelection = function(selection){

  let productPrice = 0;
  const index = _.findIndex(this.selections, (o) => {
    return o.variant.equals(selection.variant)
  });

  productPrice = this.selections[index].totalPriceVariant / this.selections[index].quantity
  this.selections[index].quantity = selection.quantity;
  this.selections[index].totalPriceVariant = selection.quantity * productPrice
}

CartSchema.methods.cleanSelections = function(){

  var cleanSelected = _.remove(this.selections, function(n) {
    return n.quantity != 0;
  });

  this.selections = cleanSelected;

  let nbProducts = 0;
  let totalPrice = 0;
  _.forEach(this.selections, (selection) => {
    nbProducts += selection.quantity
    totalPrice += selection.totalPriceVariant
  })

  this.totalPrice = totalPrice;
  this.nbProducts = nbProducts;
}

CartSchema.methods.totalClean = function(){

  return new Promise((resolve, reject) => {
    this.selections = [];
    this.totalPrice = 0;
    this.nbProducts = 0;
    this.chargeId = null;
    this.chargeDate = null;
    this.charge = null;
    this.isPaid = false;
    this.save().then((cart) => {
      resolve(cart);
    }).catch((err) => {
      reject(err);
    })
  })

}

/*
* ORDER SCHEMA
*/


const OrderStatus = {
  PAID: "PAID",
  SENT: "SENT",
  DELIVERED: "DELIVERED"
}

const OrderSchema = mongoose.Schema({
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    price: {
      type: Number,
      required: true
    },
    nbProducts: Number,
    variants : [{
      type: Schema.Types.ObjectId,
      ref: 'Variant'
    }],
    selections : [{
      variant: {
        type: Schema.Types.ObjectId,
        ref: 'Variant'
      },
      quantity: Number,
      totalPriceVariant: Number
    }],
    chargeId: String,
    chargeDate: Date,
    charge: String,
    shippingAddress: addressSchema,
    billingAddress: String,
    status:{
      type: String,
      enum: [OrderStatus.PAID, OrderStatus.SENT, OrderStatus.DELIVERED],
      required: true
    }
  },
  {
    timestamps: true
});
autoIncrement.initialize(mongoose);
OrderSchema.plugin(autoIncrement.plugin, 'Order');


//Analytics happens here
OrderSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
});

OrderSchema.post('save', function () {
    if (this.wasNew) {
        analytics.trackSellShop(this);
        this.user.lastShippingAddress = this.shippingAddress;
        this.user.save();
    }
});

OrderSchema.statics.createFromCart = function(cartId){

  return new Promise((resolve, reject) => {

    let finalOrder;
    let oldCart;

    Cart.findById(cartId).populate("shop user"). then((cart) => {
      if(!cart) reject(new Error("There is no cart with this id"));

      let variants = [];
      cart.selections.forEach((selection) => {
        variants.push(selection.variant)
      });

      oldCart = cart;
      //Create
      let newOrder = new Order({
        shop: cart.shop,
        user: cart.user,
        price: cart.totalPrice,
        selections: cart.selections,
        nbProducts: cart.nbProducts,
        chargeId: cart.chargeId,
        chargeDate: cart.chargeDate,
        charge: cart.charge,
        shippingAddress: cart.shippingAddress,
        status: OrderStatus.PAID
      });

      return newOrder.save();
    }).then((order) => {
      finalOrder = order;

      return oldCart.totalClean();
    }).then((cart) => {
      logging.info("CART MODIFIED");
      pubsub.publish('cartModified', cart);
      resolve(finalOrder);
    }).catch((err) => {
      reject(err);
    })

  });
}


OrderSchema.methods.updateStatus = function(newStatus){

  _.upperCase(newStatus);
  console.log(newStatus);
  let finalOrder;

  return new Promise((resolve, reject) => {

    const actualStatus = _.upperCase(this.status);

    this.status = newStatus
    // if(actualStatus === OrderStatus.PAID){
    //   if(newStatus === OrderStatus.SENT){
    //     this.status = OrderStatus.SENT;
    //   }
    //   else{
    //     reject(new Error("Wrong status update. From PAID, it can only update to SENT"));
    //   }
    // }
    // else if(actualStatus === OrderStatus.SENT){
    //   if(newStatus === OrderStatus.DELIVERED){
    //     this.status = OrderStatus.DELIVERED;
    //   }
    //   else{
    //     reject(new Error("Wrong status update. From SENT, it can only update to DELIVERED"));
    //   }
    // }
    // else if(actualStatus === OrderStatus.DELIVERED){
    //   reject(new Error("Wrong status update. No update available from DELIVERED"));
    // }

    this.save().then((order) => {
      finalOrder = order;

      if(order.status === OrderStatus.SENT){
        return sendMessage(order.shop, order.user.facebookId, `Votre commande #${order._id} vient d'être envoyée`, "orderStatus");
      }
      else{
        resolve(finalOrder)
      }
    }).then((parsedBody) => {
      resolve(finalOrder);
    }).catch((err) => {
      reject(err);
    })
  });

}

OrderSchema.methods.getSelectionsForFacebook = function(){

  let elements = [];
  let order = this;
  return new Promise((resolve, reject) => {

    let variantsIds = [];
    order.selections.forEach((selection) => {
      variantsIds.push(selection.variant);
    })

    Variant.find({
      '_id' : { $in : variantsIds}
    }).populate('product').then((variants) => {

      order.selections.forEach((selection) => {

        const index = _.findIndex(variants, function(o) {
          return selection.variant.equals(o._id); }
        );
        let variant = variants[index];
        const titleVariant = `${variant.product.title} - ${_.upperFirst(variant.type)} : ${variant.value}`

        if(variant){
          let elementObject = {
            'title' : titleVariant,
            'subtitle' : variant.product.shortDescription,
            'quantity' : selection.quantity,
            'price' : selection.totalPriceVariant,
            'currency' : 'EUR',
            'image_url' : variant.product.images[0]
          };

          elements.push(elementObject)

        }

        });


      resolve(elements);
    }).catch((err) => {
      reject(err);
    })

  });

}



let Order = mongoose.model('Order', OrderSchema);
let Cart = mongoose.model('Cart', CartSchema);
let Product = mongoose.model('Product', ProductSchema);
let Variant = mongoose.model('Variant', VariantSchema);
let Shop = mongoose.model('Shop', ShopSchema);
let User = mongoose.model('User', UserSchema);
let Message = mongoose.model('Message', MessageSchema);
let Conversation = mongoose.model('Conversation', ConversationSchema);

exports.Order = Order;
exports.Cart = Cart;
exports.Product = Product;
exports.Variant = Variant;
exports.Shop = Shop;
exports.Message = Message;
exports.User = User;
exports.Conversation = Conversation;
