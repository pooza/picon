'use strict';
const config = require('config').config;
const fs = require('fs');
const path = require('path');
const posix = require('posix');

const dir = path.join(__dirname, 'uploads');
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - config.purge.days);

const log = (message, priority = 'info') => {
  posix.openlog('picon', {ndelay: true, pid: true}, 'user');
  posix.syslog(priority, JSON.stringify(message));
  posix.closelog();
};

fs.readdir(dir, (error, files) => {
  Promise.resolve().then(() => {
    log({script:'purge', dir:dir, message:'start'});
  }).then(() => {
    files.filter(file => {
      const fileStat = fs.statSync(path.join(__dirname, 'uploads', file));
      return fileStat.isFile() && !file.match(/^\./) && (fileStat.mtime < yesterday);
    }).forEach(file => {
      const filePath = path.join(__dirname, 'uploads', file);
      fs.unlink(filePath, error => {
        if (error) {
          log({script:'purge', path:filePath, message:error}, 'crit');
        } else {
          log({script:'purge', path:filePath, message:'deleted'});
        }
      });
    });
  }).then(() => {
    log({script:'purge', dir:dir, message:'end'});
  });
});
