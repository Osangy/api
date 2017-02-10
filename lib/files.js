import Storage from '@google-cloud/storage';
import config from 'config';
import request from 'request';
import logging from './logging';

const CLOUD_BUCKET = config.CLOUD_BUCKET;

const storage = Storage({
  projectId: config.GCLOUD_PROJECT
});
const bucket = storage.bucket(CLOUD_BUCKET);

// Returns the public, anonymously accessable URL to a given Cloud Storage
// object.
// The object's ACL has to be set to public read.
// [START public_url]
function getPublicUrl (filename) {
  return `https://storage.googleapis.com/${CLOUD_BUCKET}/${filename}`;
}
// [END public_url]

// Downloads a given image (by URL) and then uploads it to
// Google Cloud Storage. Provides the publicly accessable URL to the callback.
// [START download_and_upload]
function downloadAndUploadImage (sourceUrl, destFileName, cb) {
  const file = bucket.file(destFileName);

  request
    .get(sourceUrl)
    .on('error', (err) => {
      logging.warn(`Could not fetch image ${sourceUrl}`, err);
      cb(err);
    })
    .pipe(file.createWriteStream())
    .on('finish', () => {
      logging.info(`Uploaded image ${destFileName}`);
      file.makePublic(() => {
        cb(null, getPublicUrl(destFileName));
      });
    })
    .on('error', (err) => {
      logging.error('Could not upload image', err);
      cb(err);
    });
}
// [END download_and_upload]


module.exports = {
  getPublicUrl,
  downloadAndUploadImage
};
