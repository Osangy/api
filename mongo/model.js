import mongoose from 'mongoose';
import Promise from 'bluebird';
import { getFacebookUserInfos } from '../utils/facebookUtils';
import moment from 'moment';
import _ from 'lodash';

const bcrypt = Promise.promisifyAll(require("bcrypt-nodejs"));



let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

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


  /*
  * MESSAGE SCHEMA
  */

const MessageSchema = mongoose.Schema({
    mid: String,
    seq: Number,
    text: String,
    is_echo: Boolean,
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    attachments: [],
    quick_reply: Schema.Types.Mixed,
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true
    }
  },
  {
    timestamps: true
  });


/*
* Create a new message entry
*/

MessageSchema.statics.createFromFacebook = function(messageObject, shop){

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
      let message = new Message({ mid: messageObject.message.mid});
      if(messageObject.message.is_echo){
        message.recipient = user;
      }
      else{
        message.sender = user;
      }



      if(messageObject.message.text) message.text = messageObject.message.text;
      if(messageObject.timestamp) message.timestamp = moment(messageObject.timestamp);
      if(messageObject.message.seq) message.seq = messageObject.message.seq;
      if(messageObject.message.attachments) message.attachments = messageObject.message.attachments;
      message.conversation = conversationObject;
      message.is_echo = (messageObject.message.is_echo) ? true : false;

      //TODO : increment message counter and date in conversation
      return message.save();
    }).then(function(message){

      resolve(message);

    }).catch(function(err){

      reject(err);

    });

  });

}


/*
* USER SCHEMA
*/

const UserSchema = mongoose.Schema({
    facebook_id: String,
    first_name: String,
    last_name: String,
    profile_pic: String,
    locale: String,
    timezone: Number,
    gender: String,
    last_update: Date
}, {
  timestamps: true
});


/*
* Find a user, if does not exist create it
*/

UserSchema.statics.createOrFindUser = function(user_id, shop){
  return new Promise(function(resolve, reject){

    User.findOne({facebook_id : user_id}).then(function(user){

      if(user){
        console.log("User found");
        resolve(user);
      }
      else{
        console.log("User NOT found");
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
      console.log("JUST DL USER INFOS : " + userJson);

      let user = new User({facebook_id : user_id});
      if(userJson.first_name) user.first_name = userJson.first_name;
      if(userJson.last_name) user.last_name = userJson.last_name;
      if(userJson.profile_pic) user.profile_pic = userJson.profile_pic;
      if(userJson.locale) user.locale = userJson.locale;
      if(userJson.timezone) user.timezone = userJson.timezone;
      if(userJson.gender) user.gender = userJson.gender;

      user.save().then(function(user){
        resolve(user);
      }).catch(function(err){
        reject(err);
      });


    }).catch(function(err){
      console.error(err);
      reject(err);
    });
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
    nb_messages: {
      type: Number,
      default: 0
    },
    last_message_date: Date
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
        console.log("Found a conversation");
        resolve(conversation);
      }
      else{
        console.log("NOT found a conversation");
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
* PRODUCTS SCHEMA
*/

const ProductSchema = mongoose.Schema({
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'Shop',
      index: true
    },
    product_id: String,
    name : String,
    price: Number,
    short_description : String,
    description : String,
    photos_urls : [String]
  },
  {
    timestamps: true
});

ProductSchema.statics.createProduct = function(data, shop){



  return new Promise(function(resolve, reject){

    if(!data.id){
      reject(new Error("The product has no id"));
    }

    //We verify if the product does not already exist
    Product.findOne({ product_id : data.id}).then(function(product){
      if(product){
        reject(new Error("The product has no id"));
      }

      if(!data.name) reject(new Error("The product has no name"));
      if(!data.categories) reject(new Error("The product has no categories"));
      if(!data.price) reject(new Error("The product has no price"));
      if(!data.reference) reject(new Error("The product has no reference"));
      if(!data.short_description) reject(new Error("The product has no short_description"));
      if(!data.description) reject(new Error("The product has no description"));
      if(!data.photos_urls) reject(new Error("The product has no photos_urls"));

      let newProduct = new Product({
        shop: shop,
        product_id : data.id,
        name: data.name,
        price: data.price,
        short_description: data.short_description,
        description: data.description,
        photos_urls: data.photos_urls.split(",")
      });

      return newProduct.save();
    }).then(function(product){
      resolve(product);
    }).catch(function(error){
      reject(error);
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
      product: {
        type: Schema.Types.ObjectId,
        ref: 'Product'
      },
      quantity: Number,
      totalPriceProduct: Number
    }],
    totalPrice: Number,
    nbProducts: Number
  },
  {
    timestamps: true
});

CartSchema.statics.addProduct = function(productId, shop, userId){


  return new Promise(function(resolve, reject){
    let user;
    let product;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Product.findById(productId);
    }).then(function(productFound){
      if(!productFound) reject(new Error("No product with this id"))

      product = productFound
      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){
      console.log("START CART");
      //There is already a cart
      if(cart){
        console.log("Already a cart");

        let foundOne = false;
        _.forEach(cart.selections, function(value) {
            if(product.equals(value.product)){
              foundOne = true;
              value.quantity++;
              value.totalPriceProduct += product.price;
              return false;
            }
        });

        if(!foundOne){
          cart.selections.push({
            product: product,
            quantity: 1,
            totalPriceProduct: product.price
          });
        }

        cart.totalPrice += product.price;
        cart.nbProducts++;

        return cart.save();
      }
      //Toherwise we create one
      else{
        console.log("New cart");
        let newCart = new Cart({
          shop : shop,
          user: user,
          selections: [],
          totalPrice: 0,
          nbProducts: 0
        });

        newCart.selections.push({
          product: product,
          quantity: 1,
          totalPriceProduct: product.price
        });
        newCart.totalPrice += product.price
        newCart.nbProducts++;

        return newCart.save();
      }


    }).then(function(cart){

      resolve(cart);
    }).catch(function(error){

      reject(error);
    });


  });


}


CartSchema.statics.removeProduct = function(productId, shop, userId){


  return new Promise(function(resolve, reject){
    let user;
    let product;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Product.findById(productId);
    }).then(function(productFound){
      if(!productFound) reject(new Error("No product with this id"))

      product = productFound
      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){
      if(cart){
        let foundOne = false;
        _.forEach(cart.selections, function(value) {
            console.log(value.product);
            if(product.equals(value.product)){
              foundOne = true;
              value.quantity--;
              value.totalPriceProduct -= product.price;
              return false;
            }
        });

        if(!foundOne){
          reject(new Error("No products with this id in the user cart"))
        }
        else{
          cart.totalPrice -= product.price;
          cart.nbProducts--;

          console.log("Cart before 0");
          console.log(cart);

          //Remove products with 0 quantity
          var cleanSelected = _.remove(cart.selections, function(n) {
            return n.quantity != 0;
          });

          cart.selections = cleanSelected;
          console.log("Cart after 0");
          console.log(cart);

          return cart.save();
        }
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



let Cart = mongoose.model('Cart', CartSchema);
let Product = mongoose.model('Product', ProductSchema);
let Shop = mongoose.model('Shop', ShopSchema);
let User = mongoose.model('User', UserSchema);
let Message = mongoose.model('Message', MessageSchema);
let Conversation = mongoose.model('Conversation', ConversationSchema);

exports.Cart = Cart;
exports.Product = Product;
exports.Shop = Shop;
exports.Message = Message;
exports.User = User;
exports.Conversation = Conversation;
