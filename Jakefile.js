'use strict';
const jake = require('jake');
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const config = require('config').config;

jake.task('start', () => {
  const command = [
    'pm2', 'start', 'picon.js',
    '--name=' + shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('stop', () => {
  const command = [
    'pm2', 'stop',
    shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('restart', () => {
  const command = [
    'pm2', 'restart',
    shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log(command);
});

jake.task('purge', () => {
  const command = ['node', 'purge.js'].join(' ');
  exec(command);
  console.log(command);
});
