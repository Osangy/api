import mongoose from 'mongoose';

let Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

var MessageSchema = mongoose.Schema({
    mid: String,
    seq: Number,
    text: String,
    attachments: Schema.Types.Mixed,
    quick_reply: Schema.Types.Mixed
    //attachments: [{ type: String, payload: Schema.Types.Mixed }]
});

let Message = mongoose.model('Message', MessageSchema);

exports.Message = Message;
