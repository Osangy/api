import passport from 'passport';
import { Strategy as JwtStrategy,  ExtractJwt } from "passport-jwt";
import { Shop } from '../mongo/models';
import config from 'config';
const LocalStrategy = require('passport-local');

const localOptions = { usernameField: 'email' };

// Setting up local login strategy
const localLogin = new LocalStrategy(localOptions, function(email, password, done) {
  Shop.findOne({ email: email }, function(err, shop) {
    if(err) { return done(err); }
    if(!shop) { return done(null, false, { error: 'Your login details could not be verified. Please try again.' }); }

    shop.comparePassword(password, function(err, isMatch) {
      if (err) { return done(err); }
      if (!isMatch) { return done(null, false, { error: "Your login details could not be verified. Please try again." }); }

      return done(null, shop);
    });
  });
});


const jwtOptions = {
  // Telling Passport to check authorization headers for JWT
  jwtFromRequest: ExtractJwt.fromAuthHeader(),
  // Telling Passport where to find the secret
  secretOrKey: config.jwtSecret
};

// Setting up JWT login strategy
const jwtLogin = new JwtStrategy(jwtOptions, function(payload, done) {
  console.log(payload);
  Shop.findById(payload._id, function(err, shop) {
    if (err) { return done(err, false); }

    if (shop) {
      done(null, shop);
    } else {
      done(null, false);
    }
  });
});

passport.use(jwtLogin);
passport.use(localLogin);
