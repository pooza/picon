'use strict';
const jake = require('jake');
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const config = require('config').config;

jake.task('start', function() {
  const command = [
    'pm2', 'start', 'picon.js',
    '--name=' + shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('stop', function() {
  const command = [
    'pm2', 'stop',
    shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('restart', function() {
  const command = [
    'pm2', 'restart',
    shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('purge', function() {
  const command = ['node', 'purge.js'].join(' ');
  exec(command);
  console.log(command);
});
