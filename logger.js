#!/usr/bin/env node

var filename = "./console.log";

var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var opener = require('opener');
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
  console.log('Opening http://localhost:3003 to see the console log');
});

opener('http://localhost:' + port);

app.use(express.static(__dirname + '/public/'));

var connections = {};
var logReaders = {};
var readers = {};

io.on('connection', function (socket) {

    //logData = { clientId: '23424sdfsdfs4', message: 'abcdef'}
    socket.on('log', function (logData) {
        if (!fs.existsSync('./' + logData.clientId)){
            fs.mkdirSync('./' + logData.clientId);
            connections[socket.id] = logData.clientId;
        }

        var filename = './' + logData.clientId + '/console.log';
        fs.appendFile(filename, logData.message);

    });

    socket.on('register', function(value) {
        if (value.type === 'reader') {
            readers[socket.id] = socket;
        }
        if (value.type === 'writer') {
            for (var socketId in readers) {
                readers[socketId].emit('newPanel', {
                    host: 'localhost',
                    port: port,
                    path: value.clientId,
                    file: 'console.log'
                });
                readers[socketId].newPanelNotified = true;
            }
        }
    });

    socket.on('checkfile', function (data) {
        var filename = './' + (data.path ?  data.path + '/' : '') + data.file;
        fs.exists(filename, function(exists) {
            if (exists) {
                socket.emit('ready', filename);
            } else {
                socket.emit('logger_error', 'FILE_NOT_FOUND');
            }
        });
    });

    socket.on('start', function (filename) {
        var tailProcess = spawn('tail', ['-f', filename]);
        tailProcess.stdout.on('data', function (data) {
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

        if (readers[socket.id]) {
            delete readers[socket.id];
        }

    });

});

