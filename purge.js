'use strict';
const config = require('config').config;
const fs = require('fs');
const path = require('path');
const posix = require('posix');

const dir = path.join(__dirname, 'tmp');
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - config.purge.days);

const log = (message, priority = 'info') => {
  message = Object.assign({script:path.basename(__filename)}, message);
  posix.openlog('picon', {ndelay: true, pid: true}, 'user');
  posix.syslog(priority, JSON.stringify(message));
  posix.closelog();
};

fs.readdir(dir, (error, files) => {
  Promise.resolve().then(() => {
    log({dir:dir, message:'start'});
  }).then(() => {
    files.filter(file => {
      const fileStat = fs.statSync(path.join(__dirname, 'tmp', file));
      return fileStat.isFile() && !file.match(/^\./) && (fileStat.mtime < yesterday);
    }).forEach(file => {
      const filePath = path.join(__dirname, 'tmp', file);
      fs.unlink(filePath, error => {
        if (error) {
          log({path:filePath, message:error}, 'crit');
        } else {
          log({path:filePath, message:'deleted'});
        }
      });
    });
  }).then(() => {
    log({dir:dir, message:'end'});
  });
});
