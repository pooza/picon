var config = require('config').config;
var fs = require('fs');
var app = require('express')();

var server = app.listen(config.server.port, function () {
  console.log('port:' + server.address().port);
})
var message = {request:{}, response:{}};
var status = 200;
var type = 'application/json';

app.get('/convert', function (request, response, next) {
  message.request.path = request.path;
  var params = request.query;
  params.pixel = (params.pixel || 100);
  params.background_color = (params.background_color || 'white');

  if (!params.path) {
    response.status(404);
    message.error = 'pathが未設定です。';
    response.json(message);
  }
  fs.readFile(params.path, function (error, data) {
    if (error) {
      response.status(404);
      message.error = error.message;
      response.json(message);
    }
    response.json(data);
  })
});

app.use(function (request, response, next) {
  message.error = 'Not Found';
  response.status(404);
  response.json(message);
});

app.use(function (error, request, response, next) {
  message.error = error + '';
  response.status(500);
  response.json(message);
});