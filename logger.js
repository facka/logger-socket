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
    if(dev !== 'eth0' && dev !== 'wlan0') {
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

    console.log('New connection: ', socket.id);

    if (!fs.existsSync('./logs')){
        fs.mkdirSync('./logs');
    }

    //logData = { clientId: '23424sdfsdfs4', message: 'abcdef'}
    socket.on('log', function (logData) {
        if (!fs.existsSync('./logs/' + logData.clientId)){
            fs.mkdirSync('./logs/' + logData.clientId);
        }

        var filename = './logs/' + logData.clientId + '/console.log';
        fs.appendFile(filename, logData.message + '\n');

    });

    socket.on('register', function(value) {
        console.log('Register:', value);
        if (value.type === 'reader') {
            readers[socket.id] = socket;
        }
        if (value.type === 'writer') {
            if (!fs.existsSync('./logs/' + value.clientId)){
                fs.mkdirSync('./logs/' + value.clientId);
            }
            var filename = './logs/' + value.clientId + '/console.log';
            fs.appendFile(filename, new Date() + 'Start logging...\n');
            connections[socket.id] = value.clientId;
            for (var socketId in readers) {
                console.log('Emit new panel');
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
        console.log('Checking file: ', data);
        var filename = './logs/' + (data.path ?  data.path + '/' : '') + data.file;
        fs.exists(filename, function(exists) {
            if (exists) {
                socket.emit('ready', filename);
            } else {
                socket.emit('logger_error', 'FILE_NOT_FOUND');
            }
        });
    });

    socket.on('start', function (filename) {
        console.log('Start: ', filename);
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
        console.log('Disconnect');
        var dir = connections[socket.id];
        //Delete folder
        if (dir) {
            console.log('Remove file and notify');

            if (!fs.existsSync('./logs/' + dir + '/console.log')){
                fs.unlinkSync('./logs/' + dir + '/console.log');
                fs.rmdir(dir);
            }

            for (var socketId in readers) {
                console.log('Emit remove panel');
                readers[socketId].emit('removePanel', {
                    host: 'localhost',
                    port: port,
                    path: dir,
                    file: 'console.log'
                });
            }
        }
        var tailProcess = logReaders[socket.id];
        if (tailProcess) {
            console.log('Killing tail process');
            tailProcess.kill();
            tailProcess = null;
            delete logReaders[socket.id];
        }

        if (readers[socket.id]) {
            delete readers[socket.id];
        }

    });

});

