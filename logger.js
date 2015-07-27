#!/usr/bin/env node

var filename = "./console.log";

var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3003;

var os=require('os');
var ifaces=os.networkInterfaces();
var ipAddress = null;

function getIp(details){
    if (details.family === 'IPv4') {
      ipAddress = details.address;
    }
}

for (var dev in ifaces) {
    if(dev !== 'eth0') {
        continue;
    }
    ifaces[dev].forEach(getIp);
}

console.log('IP: '+ipAddress);

server.listen(port, function () {
  console.log('Server listening at port %d', port);
  console.log('Append this code in the client:');
  console.log('<script id="logger" src="http://'+ipAddress+':3003/console-log.js"></script>');
  console.log('Go to http://facka.github.io/logger-web/ to connect to this logger');
});

app.use(express.static(__dirname + '/public/'));

var connections = {};
var logReaders = {};

io.on('connection', function (socket) {

    console.log('Connected new socket');

    //logData = { clientId: '23424sdfsdfs4', message: 'abcdef'}
    socket.on('log', function (logData) {

        if (!fs.existsSync('./' + logData.clientId)){
            fs.mkdirSync('./' + logData.clientId);
            connections[socket.id] = logData.clientId;
        }

        var filename = './' + logData.clientId + '/console.log';
        fs.appendFile(filename, logData.message);
    });

    socket.on('checkfile', function (data) {
        console.log(JSON.stringify(data));
        var filename = './' + (data.path ?  data.path + '/' : '') + data.file;
        console.log('Checking file: ' + filename);
        fs.exists(filename, function(exists) {
            if (exists) {
                console.log('Emit ready!');
                socket.emit('ready', filename);
            } else {
                console.log('file not found.');
                socket.emit('logger_error', 'FILE_NOT_FOUND');
            }
        });
    });

    socket.on('start', function (filename) {
        console.log('starting logger');
        var tailProcess = spawn('tail', ['-f', filename]);
        tailProcess.stdout.on('data', function (data) {
          console.log('sending data...' + data);
          socket.emit('data', ''+data);
        });
        logReaders[socket.id] = tailProcess;
    });

    socket.on('pause', function () {
        console.log('Killing tail process');
        var tailProcess = logReaders[socket.id];
        if (tailProcess) {
            tailProcess.kill();
            tailProcess = null;
        }
    });

    socket.on('disconnect', function () {
        var dir = connections[socket.id];
        //Delete folder
        if (dir) {
            fs.unlinkSync(dir + '/console.log');
            fs.rmdir(dir);
        }
        var tailProcess = logReaders[socket.id];
        console.log('Killing tail process');
        if (tailProcess) {
            tailProcess.kill();
            tailProcess = null;
            delete logReaders[socket.id];
        }

    });

});

