# logger-socket

[![PayPayl donate button](https://img.shields.io/badge/paypal-donate-yellow.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=A9EZ9FXTKK44W "Donate once-off to this project using Paypal")

[![NPM](https://nodei.co/npm/logger-socket.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/logger-socket/)

Stream the console log to a socket and serve a webpage to see it. Useful for debugging web pages in a mobile

##Install
npm install logger-socket -g


##Run
Execute in the shell
```javascript
looger-socket
```

This command starts a server that will serve a js file that you have to inject in the html file that you want to see the console log. Also it opens a web page where you can see the log.

Example of the output of the command:

```javascript
IP: 192.168.1.160
Server listening at port 3003
Append this code in the client:
<script id="logger" src="http://192.168.1.160:3003/console-log.js"></script>
Opening http://localhost:3003 to see the console log
```

Now you are ready to see the console log while you navigate from any device :)



