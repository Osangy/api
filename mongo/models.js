import mongoose from 'mongoose';
import Promise from 'bluebird';
import { getFacebookUserInfos } from '../utils/facebookUtils';
import moment from 'moment';
import _ from 'lodash';

const bcrypt = Promise.promisifyAll(require("bcrypt-nodejs"));



let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;



  /*
  * USER SCHEMA
  */

  const UserSchema = mongoose.Schema({
      facebookId: String,
      firstName: String,
      lastName: String,
      profilePic: String,
      locale: String,
      timezone: Number,
      gender: String,
      lastUpdate: Date
  }, {
    timestamps: true
  });


  /*
  * Find a user, if does not exist create it
  */

  UserSchema.statics.createOrFindUser = function(user_id, shop){
    return new Promise(function(resolve, reject){

      User.findOne({facebookId : user_id}).then(function(user){

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

        let user = new User({facebookId : user_id});
        if(userJson.firstName) user.firstName = userJson.firstName;
        if(userJson.lastName) user.lastName = userJson.lastName;
        if(userJson.profilePic) user.profilePic = userJson.profilePic;
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
        unique: true,
        required: true
      },
      title : {
        type: String,
        required: true
      },
      shortDescription : String,
      longDescription : String,
      categories : [String]
    });

  ProductSchema.statics.createProduct = function(data, shop){



    return new Promise(function(resolve, reject){

      if(!data.reference){
        reject(new Error("The product has no reference"));
      }

      //We verify if the product does not already exist
      Product.findOne({ reference : data.reference}).then(function(product){
        if(product){
          reject(new Error("This product already exists"));
        }

        if(!data.title) reject(new Error("The product has no title"));

        let newProduct = new Product({
          shop: shop,
          reference : data.reference,
          title: data.title,
        });

        if(data.shortDescription) newProduct.shortDescription = data.shortDescription;
        if(data.longDescription) newProduct.longDescription = data.longDescription;
        if(data.categories) newProduct.categories = data.longDescription.split(",");


        return newProduct.save();
      }).then(function(product){
        resolve(product);
      }).catch(function(error){
        reject(error);
      })

    });


  }



  /*
  * MESSAGE SCHEMA
  */

const MessageSchema = mongoose.Schema({
    mid: String,
    seq: Number,
    text: String,
    isEcho: Boolean,
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

MessageSchema.statics.createFromFacebook = (messageObject, shop) => {

  //See if the emssage was sent by the page or the user
  let user_id = (messageObject.message.isEcho) ? messageObject.recipient.id : messageObject.sender.id
  let user;


  return new Promise(function(resolve, reject){

    console.log(typeof(User));
    //See if user exists, or create one
    User.createOrFindUser(user_id, shop).then(function(userObject){

      user = userObject;

      //See if conversation exists, or create one
      return Conversation.findOrCreate(userObject, shop);
    }).then(function(conversationObject){


      //Create the message
      let message = new Message({ mid: messageObject.message.mid});
      if(messageObject.message.isEcho){
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
      message.isEcho = (messageObject.message.isEcho) ? true : false;

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

        cart.cleanSelections();

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
    let product;

    User.findById(userId).then(function(userFound){
      if(!userFound) reject(new Error("No user with this id"))

      user = userFound;

      return Cart.findOne({shop: shop, user: user});
    }).then(function(cart){
      if(cart){
        console.log("BEFORE CART");

        _.forEach(selections, (selection) => {
          console.log(cart);
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


CartSchema.methods.updateSelection = function(selection){
  console.log("CARRRT");
  console.log(this);
  let productPrice = 0;
  const index = _.findIndex(this.selections, (o) => {
    return o.product.equals(selection.product)
  });

  productPrice = this.selections[index].totalPriceProduct / this.selections[index].quantity
  this.selections[index].quantity = selection.quantity;
  this.selections[index].totalPriceProduct = selection.quantity * productPrice
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
    totalPrice += selection.totalPriceProduct
  })

  this.totalPrice = totalPrice;
  this.nbProducts = nbProducts;
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
