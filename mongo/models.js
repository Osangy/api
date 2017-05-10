import mongoose from 'mongoose';
import Promise from 'bluebird';
import { getFacebookUserInfos, sendMessage } from '../utils/facebookUtils';
import moment from 'moment-timezone';
import _ from 'lodash';
import logging from '../lib/logging';
import background from '../lib/background';
import rp from 'request-promise';
import config from 'config';
import autoIncrement from 'mongoose-auto-increment';
import { pubsub } from '../graphql/subscriptions';
import randtoken from 'rand-token';
import analytics from '../lib/analytics';
import messaging from '../utils/messaging';
import other from '../utils/other';
import mailgun from '../utils/mailgun'
import redis from '../utils/redis';

const bcrypt = Promise.promisifyAll(require("bcrypt-nodejs"));
Promise.promisifyAll(require("mongoose"));


let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

const addressSchema = mongoose.Schema({
  recipientName: String,
  streetNumber : String,
  route: String,
  address: String,
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
    facebookId: {
      type: String,
      unique: true
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    firstName: String,
    lastName: String,
    email: String,
    phoneNumber: String,
    profilePic: String,
    locale: String,
    timezone: Number,
    gender: String,
    lastShippingAddress : addressSchema,
    lastUpdate: Date,
    lastMessageSentDate: Date,
    adSource : {
      type: Schema.Types.ObjectId,
      ref: 'Ad'
    },
    lastAdReferal : {
      referral: String,
      source: String,
      typeAd: String,
      ad_id: String
    },
    referral : {
      referral: String,
      source: String,
      typeRef: String,
      ad_id: String
    },
}, {
  timestamps: true
});

UserSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    this.newAdSource = this.isModified("adSource");
    this.newUknown = this.isModified("isUnknown");
    next();
});

//After a message save we increment the nb of message of the conversation
UserSchema.post('save', function(message) {
  if(this.wasNew){
    analytics.trackNewCustomer(this);
    let cart = new Cart({
      shop : this.shop,
      user : this,
      shippingAddress: {
        recipientName: this.getFullName()
      }
    });
    cart.save();
  }

  if(this.newAdSource){
    if(this.adSource){
      this.adSource.newUsers++;
      this.adSource.save();
    }
  }
});

UserSchema.methods.getFullName = function(){
  let fullName = "";
  if(this.firstName) fullName += `${this.firstName} `;
  if(this.lastName) fullName += this.lastName;

  return fullName;
}


/*
* Find a user, if does not exist create it
*/

UserSchema.statics.createOrFindUser = function(shop, messageObject){

  let facebookUserId;
  let isEcho;
  let referral = null;
  if(messageObject.postback){
    facebookUserId = messageObject.sender.id;
    isEcho = false;
    if(messageObject.postback.referral) referral = messageObject.postback.referral;
  }
  else{
    facebookUserId = (messageObject.message.is_echo) ? messageObject.recipient.id : messageObject.sender.id
    isEcho = messageObject.message.is_echo;
  }

  return new Promise((resolve, reject) => {

    User.findOne({facebookId : facebookUserId}).then((user) => {

      //TODO: Update user if referral in message
      if(user){
        Conversation.findOne({user:user,shop:shop}).then((conversation) => {
          if(!conversation) throw new Error(`We did not find the conversation for user ${user.id}`)
          resolve({user: user, conversation: conversation});
        }).catch((err) => {
          reject(err);
        });
      }
      else if(!isEcho){
        logging.info("User NOT found");
        User.createFromFacebook(shop, facebookUserId, referral).then((res) => {
          resolve(res);
        }).catch((err) => {
          reject(err);
        });

      }
      else{
        resolve();
      }

    }).catch((err) => {
      reject(err);
    });

  })
}


UserSchema.statics.createFromReferral = function(message){

  return new Promise((resolve, reject) => {

    const referral = message.referral;

    Shop.findOne({pageId: message.recipient.id}).then((shop) => {
      if(!shop) throw new Error(`We don't know the shop with the page Id : ${message.recipient.id}`);

      return User.createFromFacebook(shop, message.sender.id, referral);
    }).then((user) => {
      //TODO : Do something depending on the referral
      resolve();
    }).catch((err) => {
      reject(err);
    });

  })
}

  /*
  * Create a user from the Facebook infos
  */

UserSchema.methods.getInfos = function(shop){

  let user = this;
  return new Promise((resolve, reject) => {

    getFacebookUserInfos(shop, user.facebookId).then((userJson) => {
      logging.info(userJson)
      if(userJson === false) throw 'nouser'
      else{
        if(userJson.first_name) this.firstName = userJson.first_name;
        if(userJson.last_name) this.lastName = userJson.last_name;
        if(userJson.profile_pic) this.profilePic = userJson.profile_pic;
        if(userJson.locale) this.locale = userJson.locale;
        if(userJson.timezone) this.timezone = userJson.timezone;
        if(userJson.gender) this.gender = userJson.gender;
        if(userJson.last_ad_referral){
          user.lastAdReferal = {
            source: userJson.last_ad_referral.source,
            typeAd: userJson.last_ad_referral.type,
            ad_id: userJson.last_ad_referral.ad_id
          }

          if(userJson.last_ad_referral.ref) user.lastAdReferal.referral = userJson.last_ad_referral.ref;
        }

        if(userJson.last_ad_referral){
          return this.addAd(shop, userJson.last_ad_referral.ad_id);
        }
        else{
          return this.save();
        }
      }
    }).then((user) => {
      resolve(user);
    }).catch((err) => {
      if(err === 'nouser') resolve();
      else{
        logging.error(err);
        reject(err);
      }
    });
  });
}

UserSchema.statics.createFromFacebook = function(shop, userFacebookId, referral){

  return new Promise((resolve, reject) => {

    let user = new User({facebookId : userFacebookId});
    user.shop = shop;

    if(referral){
      user.referral = {
        source: referral.source,
        typeRef: referral.type,
        referral: referral.ref
      }
      if(referral.ad_id) user.referral.ad_id = referral.ad_id;
    }


    user.save().then((user) => {
      if(!user) throw new Error(`Problem creating the user`);
      return user.getInfos(shop);
    }).then((user) => {
      if(!user) throw "nouser"
      return Conversation.findOrCreate(user, shop);
    }).then((conversation) => {
      if(!conversation) throw new Error("Problem creating a conversation for the user");

      resolve({user:user, conversation: conversation});
    }).catch((err) => {
      if(err === "nouser") resolve();
      logging.error(err);
      reject(err);
    });
  });

}

UserSchema.methods.addAd = function(shop, adId){

  const user = this;
  return new Promise((resolve, reject) => {

    Ad.findOrCreate(shop, adId).then((ad) => {
      user.adSource = ad;
      return user.save();
    }).then((user) => {
      resolve(user);
    }).catch((err) => {
      reject(err);
    });

  });

}

UserSchema.statics.gotReferral = function(message){

  const userId = message.sender.id;
  const referral = message.referral;
  return new Promise((resolve, reject) => {

    User.findOne({facebookId: userId}).populate("shop").then((user) => {
      if(!user){
        return User.createFromReferral(message);
      }
      else{
        logging.info(referral);
        if(referral.source) user.referral.source = referral.source;
        if(referral.type) user.referral.typeRef = referral.type;
        if(referral.ref) user.referral.referral = referral.ref;
        logging.info(user.toString());
        if(referral.ad_id){
          user.referral.ad_id = referral.ad_id;
          return user.getInfos(user.shop);
        }
        else return user.save();
      }


    }).then(() => {
      //TODO: Do something depending the referral
      resolve();
    }).catch((err) => {
      if(err === "noAd") resolve();
      reject(err);
    })



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
    closedAutoOption : {
      isActivated: {
        type: Boolean,
        default: false
      },
      startHour: Number,
      endHour: Number,
      message: String
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
    timezone: {
      type: String,
      default: "Europe/Paris"
    },
    shopUrl: { type: String },
    pageId: { type: String },
    pageToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isGetStartedActivated: {
      type: Boolean,
      default: false
    }
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
            client_secret: config.STRIPE_SECRET_KEY,
            code: authorizationCode,
            grant_type: "authorization_code",
            client_id: config.STRIPE_CLIENT_ID
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


ShopSchema.methods.sendAutoMessageIfClosed = function(message){

  return new Promise((resolve, reject) => {

    if(!message.sender) resolve(false);
    if(!this.closedAutoOption) resolve(false);
    if(!this.closedAutoOption.isActivated) resolve(false);
    else{
      const now = moment().tz(this.timezone);
      const hour = now.hour();
      logging.info("HOUR");
      logging.info(hour);
      logging.info(this.closedAutoOption.startHour);
      if((hour < this.closedAutoOption.endHour) || (hour >= this.closedAutoOption.startHour )){
        sendMessage(this, message.sender.facebookId, this.closedAutoOption.message, "autoClosedMessage").then((message) => {
          resolve(true);
        }).catch((err) => {
          reject(err);
        })
      }
      else{
        resolve(false);
      }
    }

  })

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
    price: Number,
    hasColorVariants: {
      type: Boolean,
      default: false
    },
    hasSizeVariants: {
      type: Boolean,
      default: false
    },
    colors: [String],
    sizes: [String],
    imagesColor: {
      color1: String,
      color2: String,
      color3: String,
      color4: String,
      color5: String
    }
});

ProductSchema.statics.createProduct = (data, shop) => {



  return new Promise((resolve, reject) => {

    let finalProduct;

    if(!data.reference){
      reject(new Error("The product has no reference"));
    }

    //We verify if the product does not already exist
    Product.findOne({ reference : data.reference, shop : shop}).then((product) => {
      if(product){
        reject(new Error("This product already exists"));
      }

      if(!data.title) reject(new Error("The product has no title"));

      let newProduct = new Product({
        shop: shop,
        reference : data.reference,
        title: data.title,
        images: data.images.split(","),
        price: Number(data.price),
      });

      if(data.shortDescription) newProduct.shortDescription = data.shortDescription;
      if(data.longDescription){
        const arrayLong = _.split(data.longDescription,"\n");
        let finalLong= "";
        arrayLong.map((line) => {
          finalLong += `<p>${line}</p>`;
        });
        newProduct.longDescription = finalLong;
      }
      if(data.categories) newProduct.categories = data.categories.split(",");
      if(data.colors){
        newProduct.colors = data.colors.split(",");
        newProduct.hasColorVariants = true;
      }
      if(data.sizes){
        newProduct.sizes = data.sizes.split(",");
        newProduct.hasSizeVariants = true;
      }
      if(data.imagesColor1) newProduct.imagesColor.color1 = data.imagesColor1;
      if(data.imagesColor2) newProduct.imagesColor.color2 = data.imagesColor2;
      if(data.imagesColor3) newProduct.imagesColor.color3 = data.imagesColor3;
      if(data.imagesColor4) newProduct.imagesColor.color4 = data.imagesColor4;
      if(data.imagesColor5) newProduct.imagesColor.color5 = data.imagesColor5;

      return newProduct.save();
    }).then((product) => {

      finalProduct = product;

      return Variant.createVariants(product);
    }).then(() => {
      resolve(finalProduct);
    }).catch((error) => {
      reject(error);
    })

  });


}


ProductSchema.statics.searchProducts = function(searchString, shop, limit){


  let andSearch = [];
  _.split(searchString, " ").map((word) => {
    andSearch.push({title : { "$regex" : '.*'+word+'.*', "$options" : "i" } })
  });

  return new Promise((resolve, reject) => {

    Product.find({
      $and: [
        {shop: shop},
        {$or : [
          { $and : andSearch},
          { categories: {$in : _.split(searchString, " ")}}
        ]}
      ]}
    ).limit(limit).then((products) => {
      resolve(products);
    }).catch((err) => {
      reject(err);
    });
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
    value: String,
    productTitle : String,
    title: String,
    price: Number,
    color: String,
    lowerColor: String,
    size: String,
    lowerSize: String,
    images: [String]
});

// VariantSchema.pre('save', function (next) {
//     this.wasNew = this.isNew;
//     next();
// });
//
// //After a message save we increment the nb of message of the conversation
// VariantSchema.post('save', function(message) {
//   if(this.wasNew){
//     this.productTitle = this.product.title;
//     this.title = `${this.product.title} - ${this.type} : ${this.value}`;
//     this.price = this.product.price;
//   }
// }

VariantSchema.methods.getTitle = function(){
  let title = this.productTitle;
  if(this.color) title += ` - Couleur : ${this.color}`;
  if(this.size) title += ` - Taille : ${this.size}`;

  return title;
}

VariantSchema.statics.createVariant = (product, color, size, imagesColor) => {

  return new Promise((resolve, reject) => {

    let newVariant = new Variant({
      product: product,
      productTitle: product.title,
      price: product.price
    });

    if(color){
      newVariant.color = color;
      newVariant.lowerColor= _.toLower(color);
    }
    if(size){
      newVariant.size = size;
      newVariant.lowerSize = _.toLower(size);
    }
    if(imagesColor) newVariant.images = imagesColor;

    newVariant.save().then((variant) => {
      resolve(variant);
    }).catch((err) => {
      reject(err);
    })

  });
}

VariantSchema.statics.createVariants = (product) => {

  let variants = [];

  return new Promise((resolve, reject) => {

    //We have color variants
    if(product.hasColorVariants){
      product.colors.forEach((color, index) => {
        const righIndex = index+1;
        const imagesColor = product.imagesColor[`color${righIndex}`]
        //We also have size variants
        if(product.hasSizeVariants){
          product.sizes.forEach((size) => {
            variants.push(Variant.createVariant(product, color, size, imagesColor));
          });
        }
        //We only have color variants
        else{
          variants.push(Variant.createVariant(product, color, null, imagesColor));
        }
      });
    }
    //We only have size variants
    else if(product.hasSizeVariants){
      product.sizes.forEach((size) => {
        variants.push(Variant.createVariant(product, null, size, null));
      });
    }
    //No variants at all. But create one for the product
    else{
      variants.push(Variant.createVariant(product, null, null, null));
    }

    //Save all ou variants
    Promise.all(variants).then(() => {
      resolve();
    }).catch((err) => {
      reject(err);
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
    quick_reply: String,
    echoType: {
        type: String,
        enum: ['standard', 'askPayCart', 'payConfirmation', 'receipt', 'orderStatus', 'addedProductCart', "giveCartState", "listProductsCart", "autoClosedMessage", "sendInfos", "flow:size","flow:color"]
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
MessageSchema.post('save', function(message, next) {
  if(this.wasNew){
    analytics.trackMessage(this);
    Conversation.newMessage(this).finally(() => {
      next();
    })
  }
  else{
    next();
  }

});



/*
* Create a new message entry
*/

MessageSchema.statics.createFromFacebook = (messageObject, shop) => {

  //See if the emssage was sent by the page or the user
  let user;
  let conversation;
  let finalMessage = null;

  let adId = null;
  if(messageObject.message.metadata && other.isJson(messageObject.message.metadata)){
    const meta = JSON.parse(messageObject.message.metadata);
    if(meta.ad_id) adId = meta.ad_id
  }

  return new Promise((resolve, reject) => {

    //Capture the source if there is one
    User.createOrFindUser(shop, messageObject).then((res) => {
      if(!res) throw "nouser"

      user = res.user;
      conversation = res.conversation;

      return Message.createMessage(shop, user, conversation, messageObject);
    }).then((message) => {
      finalMessage = message;
      return shop.sendAutoMessageIfClosed(message);
    }).then(() => {
      resolve(finalMessage);
    }).catch((err) => {
      if(err == "nouser") resolve();
      reject(err);
    });

  });

}

MessageSchema.statics.createMessage = (shop, user, conversation, messageObject) => {
  return new Promise((resolve, reject) => {
    let finalMessage;

    let message = new Message({
      isEcho : (messageObject.message.is_echo) ? true : false,
      conversation : conversation,
      timestamp : moment(messageObject.timestamp),
      mid: messageObject.message.mid,
      shop: shop
    });

    if(messageObject.message.quick_reply){
      message.quick_reply = messageObject.message.quick_reply.payload;
    }

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
      try{
        const metadata = JSON.parse(messageObject.message.metadata);
        if(!metadata.ad_id) message.echoType = messageObject.message.metadata;
      } catch(e) {
        message.echoType = messageObject.message.metadata;
      }
    }

    message.save().then((message) => {
      resolve(message);
    }).catch((err) => {
      reject(err);
    });

  });
}


MessageSchema.statics.createFromShopToFacebook = (type, content, userFacebookId, shop) => {
  return new Promise((resolve, reject) => {

    let user;
    //See if user exists, or create one
    User.findOne({facebookId : userFacebookId}).then((userObject) => {

      if(!userObject) reject(new Error("No user found"))

      user = userObject;

      //See if conversation exists, or create one
      return Conversation.findOne({shop : shop, user : user});
    }).then((conversationObject) => {

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

    Message.findOne({ mid: messageObject.message.mid }).populate("conversation shop").then((message) => {
      //Update message if we already have it in the database
      if(message){
        message.timestamp = new Date(messageObject.timestamp);
        return message.save();
      }
      //Otherwise we create it as a new one
      else{
        return Message.createFromFacebook(messageObject, shop);
      }

    }).then((message) => {
      resolve(message);
    }).catch((err) => {
      logging.error(err.message);
      reject(err);
    });

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
        if(attachment.payload){
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
        }
        else{
          payload.text = newAttachment.title;
        }

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
    sources : [{
      type: Schema.Types.ObjectId,
      ref: 'Source'
    }],
    nbMessages: {
      type: Number,
      default: 0
    },
    isAvailable: {
      type: Boolean,
      default: false
    },
    lastCustomerRead: Date,
    nbUnreadMessages: {
      type: Number,
      default: 0
    },
    lastMessageDate: Date
  },
  {
    timestamps: true
  });

ConversationSchema.pre('save', function (next) {
    this.newAvailable = this.isModified("isAvailable");
    next();
});

//After a message save we increment the nb of message of the conversation
ConversationSchema.post('save', function(conversation) {
  if(this.newAvailable){
    Shop.findById(conversation.shop).then((shop) => {
      if(shop){
        mailgun.sendNewConversationMail(shop.email, null).then(() => {
          logging.info("Email for new conversation sent");
        }).catch((err) => {
          logging.error(err.message);
        })
      }
    }).catch((err) => {
      logging.error(err.message);
    })

  }
});

/*
* Find a conversation, or create if it does not exists.
*/

ConversationSchema.statics.findOrCreate = function(user, shop){

  return new Promise((resolve, reject) => {
    Conversation.findOne({ shop: shop._id, user: user._id}).then((conversation) => {

      if(conversation){
        resolve(conversation);
      }
      else{
        let finalConversation;
        logging.info("NOT found a conversation, need to create one");
        conversation = new Conversation({ shop : shop, user : user});
        conversation.save().then((conversation) => {
          finalConversation = conversation;
          return conversation.addRedisMessages(shop, user);
        }).then(() => {
          pubsub.publish('newConversationChannel', conversation);
          resolve(finalConversation);
        }).catch((err) => {
          reject(err);
        });
      }

    }).catch((err) => {
      reject(err);
    });

  });


}

/*
* Save when a user read the messages
*/

ConversationSchema.statics.justRead = function(pageId, userFbId, watermark){

  return new Promise(function(resolve, reject){
    let foundShop = null;
    let foundUser = null;

    Shop.findOne({pageId : pageId}).then((shop) => {
      if(!shop) reject(new Error("We did not find any shop with this page Id"));

      foundShop = shop;
      return User.findOne({ facebookId : userFbId});
    }).then((user) => {
      if(!user) resolve();

      foundUser = user;
      return Conversation.findOne({user : user, shop : foundShop}).populate("shop");
    }).then((conversation) => {
      if(!conversation) resolve();

      conversation.lastCustomerRead = new Date(watermark);
      return conversation.save();
    }).then((conversation) => {
      pubsub.publish('newConversationChannel', conversation);
      resolve(conversation)
    }).catch((err) => {
      reject(err);
    })

  });


}

/*
* Update conversation after new message
*/

ConversationSchema.statics.newMessage = function(message){

  return new Promise((resolve, reject) => {

    let actions = [];

    Conversation.findById(message.conversation).populate("user shop").then((conversation) => {
      conversation.nbMessages++;

      if(!message.isEcho){
        conversation.nbUnreadMessages++;
        conversation.user.lastMessageSentDate = message.timestamp;
        actions.push(conversation.user.save());
      }

      conversation.lastMessageDate = message.timestamp;
      actions.push(conversation.save())

      if(conversation.isAvailable){
        pubsub.publish('newConversationChannel', conversation);
      }
      //if(conversation.nbMessages === 1) actions.push(mailgun.sendNewConversationMail(message.shop.email, message));

      return Promise.all(actions);
    }).then(() => {
      resolve()
    }).catch((err) => {
      reject(err);
    })

  });


}

ConversationSchema.methods.addRedisMessages = function(shop, user){

  return new Promise((resolve, reject) => {
    const conversation = this;
    redis.retrieveMessages(user.facebookId, shop.pageId).then((messages) => {
      if(!messages) throw "nomessages";
      if(messages.length == 0) throw "nomessages";

      let messagesActions = [];
      messages.forEach((message) => {
        messagesActions.push(Message.createMessage(shop, user, conversation, JSON.parse(message)));
      });

      return Promise.all(messagesActions);
    }).then(() => {
      return redis.deleteMessages(user.facebookId, shop.pageId);
    }).then(() => {
      resolve();
    }).catch((err) => {
      if(err === "nomessages") resolve();
      else reject(err);
    })
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
      individualPrice: Number,
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
    let finalCart;

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


  return new Promise((resolve, reject) => {
    let user;
    let variant;
    let finalCart;

    User.findById(userId).then((userFound) => {
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Variant.findById(variantId).populate('product');
    }).then((variantFound) => {
      if(!variantFound) reject(new Error("No variant with this id"))

      variant = variantFound
      return Cart.findOne({shop: shop, user: user}).populate('user shop');
    }).then((cart) => {

      //There is already a cart
      if(cart){

        let foundOne = false;
        _.forEach(cart.selections, (value) => {
            if(variant.equals(value.variant)){
              foundOne = true;
              value.quantity++;
              value.totalPriceVariant = (value.totalPriceVariant * 10 + variant.product.price * 10) / 10;
              return false;
            }
        });

        if(!foundOne){
          cart.selections.push({
            variant: variant,
            quantity: 1,
            totalPriceVariant: variant.product.price,
            individualPrice: variant.product.price
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
          totalPriceVariant: variant.product.price,
          individualPrice: variant.product.price
        });

        newCart.cleanSelections();

        return newCart.save();
      }


    }).then((cart) =>{
      finalCart = cart;
      pubsub.publish('cartModified', cart);
      return messaging.sendInfosAfterAddCart(variant, shop, user, finalCart);
    }).then(() => {
      resolve(finalCart);
    }).catch((error) =>{
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
        if(cart.shippingAddress.recipientName == null) cart.shippingAddress.recipientName = `${user.firstName} ${user.lastName}`
        return cart.save();
      }
      //Toherwise we create one
      else{
        reject(new Error("No cart for this user, so we are not able to remove any products from it"))
      }


    }).then((cart) =>{

      resolve(cart);
    }).catch((error) => {

      reject(error);
    });

  });
}


CartSchema.methods.updateSelection = function(selection){

  const index = _.findIndex(this.selections, (o) => {
    return o.variant.equals(selection.variant)
  });

  this.selections[index].quantity = selection.quantity;
  this.selections[index].totalPriceVariant = Number(selection.quantity * this.selections[index].individualPrice);
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
    totalPrice = (totalPrice * 10 + selection.totalPriceVariant * 10)/10
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

        if(this.user.adSource != null){
          Ad.findById(this.user.adSource).then((ad) => {
            ad.nbOrders++
            ad.amountOrders = (ad.amountOrders * 10 + this.price * 10)/10;
            ad.save();
          });
        }
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
        return messaging.sendDeliveryUpdate(order.shop, order.user,  order);
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

OrderSchema.methods.getSelectionsForFacebook = function() {

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

        if(variant){
          let elementObject = {
            'title' : variant.getTitle(),
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

const AdSchema = mongoose.Schema({
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    adId : {
      type: String,
      index: true,
      unique: true,
      required: true
    },
    product : {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    newUsers: {
      type: Number,
      default: 0
    },
    nbOrders: {
      type: Number,
      default: 0
    },
    amountOrders: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true
});

AdSchema.statics.findOrCreate = function(shop, adId){

  return new Promise((resolve, reject) => {

    Ad.findOne({shop: shop, adId: adId}).then((ad) => {
      if(ad) resolve(ad);
      else{
        Ad.createFromFacebook(shop, adId).then((ad) => {
          resolve(ad);
        });
      }
    }).catch((err) => {
      reject(err);
    })
  });

}

AdSchema.statics.createFromFacebook = function(shop, adId){

  const newAd = new Ad({
    shop: shop,
    adId: adId
  });

  return new Promise((resolve, reject) => {
    newAd.save().then((ad) => {
      resolve(ad);
    }).catch((err) => {
      reject(err);
    })
  });

}

let Ad = mongoose.model('Ad', AdSchema);
let Order = mongoose.model('Order', OrderSchema);
let Cart = mongoose.model('Cart', CartSchema);
let Product = mongoose.model('Product', ProductSchema);
let Variant = mongoose.model('Variant', VariantSchema);
let Shop = mongoose.model('Shop', ShopSchema);
let User = mongoose.model('User', UserSchema);
let Message = mongoose.model('Message', MessageSchema);
let Conversation = mongoose.model('Conversation', ConversationSchema);

exports.Ad = Ad;
exports.Order = Order;
exports.Cart = Cart;
exports.Product = Product;
exports.Variant = Variant;
exports.Shop = Shop;
exports.Message = Message;
exports.User = User;
exports.Conversation = Conversation;
