import mongoose from 'mongoose';
import Promise from 'bluebird';
import { getFacebookUserInfos } from '../utils/facebookUtils';



let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

  /*
  * MESSAGE SCHEMA
  */

var MessageSchema = mongoose.Schema({
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
    attachments: [Schema.Types.Mixed],
    quick_reply: Schema.Types.Mixed,
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true
    }
});


/*
* Create a new message entry
*/

MessageSchema.statics.createFromFacebook = function(messageObject, pageId){

  //See if the emssage was sent by the page or the user
  let user_id = (messageObject.message.is_echo) ? messageObject.recipient.id : messageObject.sender.id
  let user;


  return new Promise(function(resolve, reject){

    //See if user exists, or create one
    User.createOrFindUser(user_id).then(function(userObject){

      user = userObject;

      //See if conversation exists, or create one
      return Conversation.findOrCreate(userObject, pageId);
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

var UserSchema = mongoose.Schema({
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

UserSchema.statics.createOrFindUser = function(user_id){
  return new Promise(function(resolve, reject){

    User.findOne({facebook_id : user_id}).then(function(user){

      if(user){
        console.log("User found");
        resolve(user);
      }
      else{
        console.log("User NOT found");
        User.createFromFacebook(user_id).then(function(user){
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

UserSchema.statics.createFromFacebook = function(user_id){

  return new Promise(function(resolve, reject){

    getFacebookUserInfos(user_id).then(function(userJson){
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

var ConversationSchema = mongoose.Schema({
    page_id: {
      type: String,
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
});

/*
* Find a conversation, or create if it does not exists.
*/

ConversationSchema.statics.findOrCreate = function(user, page_id){

  return new Promise(function(resolve, reject){
    Conversation.findOne({ page_id: page_id, user: user._id}).then(function(conversation){

      if(conversation){
        console.log("Found a conversation");
        resolve(conversation);
      }
      else{
        console.log("NOT found a conversation");
        conversation = new Conversation({ page_id : page_id, user : user});

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


let User = mongoose.model('User', UserSchema);
let Message = mongoose.model('Message', MessageSchema);
let Conversation = mongoose.model('Conversation', ConversationSchema);

exports.Message = Message;
exports.User = User;
exports.Conversation = Conversation;
