var jake = require('jake');
var exec = require('child_process').exec;
var shellescape = require('shell-escape');
var config = require('config').config;

jake.task('start', function() {
  var command = [
    'pm2', 'start', 'app.js',
    '--name=' + shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log('start');
});

jake.task('stop', function() {
  var command = [
    'pm2', 'stop',
    shellescape([config.application.name]),
  ].join(' ');
  exec(command);
  console.log('stop');
});
