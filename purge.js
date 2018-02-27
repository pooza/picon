'use strict';
const config = require('config').config;
const fs = require('fs');
const path = require('path');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - config.purge.days);

fs.readdir(path.join(__dirname, 'uploads'), function (error, files) {
  files.filter(function (file) {
    const fileStat = fs.statSync(path.join(__dirname, 'uploads', file));
    return fileStat.isFile() && !file.match(/^\./) && (fileStat.mtime < yesterday);
  }).forEach(function (file) {
    const filePath = path.join(__dirname, 'uploads', file);
    fs.unlink(filePath, function (error) {
      if (error) {
        console.error('%j', {script:'purge', path:filePath, message:error});
      } else {
        console.info('%j', {script:'purge', path:filePath, message:'deleted'});
      }
    });
  });
});
