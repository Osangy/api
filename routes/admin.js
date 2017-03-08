import config from 'config';
import prettyjson from 'prettyjson';
import csv from 'fast-csv';
import fs from 'fs';
import { Shop, Product, Variant } from '../mongo/models';
import _ from 'lodash';


/*
* Import CSV File interface
*/

exports.importInterface = function(req, res){
  res.render('admin', { title: 'Hey', message: 'Hello there!' })
};


/*
* Upload CSV Catalog
*/

exports.uploadCatalog = function(req, res, next){


  if(!req.body.shop_id){
    res.status(500).send('We need a shop id');
  }
  else{
    Shop.findById(req.body.shop_id).then(function(shop){
      //We found a shop with this id
      if(shop){
        var products = [];
        var stream = fs.createReadStream(req.file.path);

        var csvStream = csv({headers : ["reference", "title", "categories", "shortDescription", "longDescription", "images", "sizes", "price"]})
              .validate(function(data, next){
                console.log(data);
                Product.createProduct(data, shop).then(function(product){
                  products.push(data);
                  next(null, product); //valid if the model does not exist
                }).catch(function(err){
                  console.error(err.message);
                  next(err);
                });
             })
            .on("data", function(data){
            })
            .on("end", function(){
                 console.log("done");
                 res.render("resultImport", {products : products });
            });

        stream.pipe(csvStream);
      }
      else{
        res.status(500).send('No shop with this id !');
      }
    }).catch(function(err){
      res.status(500).send(err.message);
    });
  }


};
