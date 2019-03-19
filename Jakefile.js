'use strict';
const jake = require('jake');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const config = require('config').config;
config.package = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

jake.task('start', () => {
  const command = [
    'pm2', 'start', 'picon.js',
    '--name=' + shellescape([config.package.name]),
  ].join(' ');
  exec(command);
  console.info(command);
});

jake.task('stop', () => {
  const command = [
    'pm2', 'stop',
    shellescape([config.package.name]),
  ].join(' ');
  exec(command);
  console.info(command);
});

jake.task('restart', () => {
  const command = [
    'pm2', 'restart',
    shellescape([config.package.name]),
  ].join(' ');
  exec(command);
  console.info(command);
});
