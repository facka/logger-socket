angular.module('loggerApp', ['mgcrea.ngStrap','ngAnimate','ngStorage'])
  .controller('PanelContainerController', ['PanelsService', '$scope', function(PanelsService, $scope) {
    var container = this;
    container.panels = PanelsService.panels;

    container.close = function(id) {
        PanelsService.removePanel(id);
    };
  }]);

angular.module('loggerApp').controller('HeaderController', ['$scope','PanelsService', '$modal', function($scope, PanelsService, $modal) {
  var header = this;

  $scope.config = {};
  $scope.save = createPanel;
  $scope.errors = [];

  var newPanelModal = $modal({scope: $scope, template: 'views/newPanelModal.html', show: false});

  function createPanel(cancel) {
        $scope.errors.length = 0;
        PanelsService.createPanel($scope.config).then(function(panel){
            PanelsService.addPanel(panel);
            newPanelModal.hide();
        },function(error) {
            if (error === 'FILE_NOT_FOUND') {
                $scope.errors.push('File not found.');
            }
            else {
                $scope.errors.push('Soemthing went wrong. Please, check the info that you send.');
            }
        });
  }

  header.openNewPanelModal = function() {
      $scope.config = {};
      newPanelModal.$promise.then(newPanelModal.show);
  };
}]);

angular.module('loggerApp').directive('highlight', function() {
    return {
        restrict: 'A',
        scope: {
            highlight: '='
        },
        link: function (scope, element) {
            var value = element[0].innerHTML.trim();
            var message = scope.$parent.$eval(value.substring(2, value.length - 2));

            scope.$watch(function() {
                return scope.highlight;
            }, function(newVal) {
                if (newVal) {
                    var highlightedMessage = message.split(newVal).join('<mark>'+newVal+'</mark>');
                    element[0].innerHTML = highlightedMessage;
                }
                else {
                    element[0].innerHTML = message;
                }
            });
        }
    };
});

angular.module('loggerApp').directive('scrollBottom', function() {
    return {
        restrict: 'A',
        scope: {
            scrollBottom: '='
        },
        link: function (scope, element) {
            scope.scrollBottom(function() {
                element[0].scrollTop = element[0].scrollHeight;
            });
        }
    };
});

angular.module('loggerApp').service('PanelsService', ['Panel','$q','$localStorage','$timeout', function(Panel, $q, $localStorage, $timeout) {
        var _this = this;
        this.panels = {};

        function save(panelConfig) {
            var store = [];
            if ($localStorage.panels) {
                store = JSON.parse($localStorage.panels);
            }
            store.push(panelConfig);
            $localStorage.panels = JSON.stringify(store);
        }

        function load() {
            if ($localStorage.panels) {
                var panels = JSON.parse($localStorage.panels);
                panels.forEach(function(panelConfig) {
                    _this.createPanel(panelConfig).then(function(panel) {
                        _this.panels[panel.id] = panel;
                    });
                });
            }
        }

        this.createPanel = function(config) {
            return $q(function(resolve, reject){
                var panel = new Panel(config.host, config.port, config.path, config.file);
                panel.onReady(function() {
                    resolve(panel);
                });
                panel.onError(function(error) {
                    reject(error);
                });
            });
        };

        this.addPanel = function(panel) {
            this.panels[panel.id] = panel;
            save(panel.config);
        };

        this.removePanel = function(id) {
            if (this.panels[id]) {
                this.panels[id].close();
                delete this.panels[id];
            }
        };

        var socket = io('http://localhost:3003');

        socket.emit('register', { type: 'reader' });

        socket.on('newPanel', function(config) {
            _this.createPanel(config).then(function(panel) {
                $timeout(function() {
                    console.log('Panel added');
                    _this.addPanel(panel);
                });
            }, function() {
                console.log('Error creating panel: ', config);
            });
        });

        load();
}]);

angular.module('loggerApp').factory('Panel', function($timeout) {
    var PLAYING = 'PLAYING';
    var PAUSED = 'PAUSED';

    var id = 0;

    var Panel = function(host, port, path, file) {
        var _this = this;
        this.id = id++;
        this.log = [];
        this.size = 10000;
        this.filteredLog = [];
        this.status = PLAYING;
        this.config = {
            host: host,
            port: port,
            path: path,
            file: file,
            live: true,
            date: new Date(),
            dateFormat: 'mm/dd/YYYY'
        };
        this.searchText = '';
        this.socket = io('http://' + this.config.host + ':' + this.config.port, {forceNew: true});

        this.socket.on('logger_error', function (error) {
            _this.notifyError(error);
        });

        this.socket.on("connect_failed",function() {
            _this.notifyError('CONNECT_FAILED');
        });

        this.socket.on("connect_error",function() {
            _this.notifyError('CONNECT_ERROR');
            _this.socket.io.disconnect();
        });

        this.socket.on('ready', function (filename) {
            _this.socket.emit('start', filename);
            _this.notifyReady();
        });

        this.socket.on('data', function (data) {
            $timeout(function() {
                var lines = data.split('\n').filter(function(value) {
                    return !!value;
                });
                var array = [];
                lines.forEach(function (line) {
                    array.push({
                        value: line,
                        id: _this.log.length + array.length
                    });
                });
                // Checks if new lines exceed log size
                if (_this.log.length + array.length > _this.size) {
                    var removeCount = (_this.log.length + array.length) - _this.size;
                    for (var i=0; i< removeCount; i++) {
                        _this.log.shift();
                    }
                }
                _this.log = _this.log.concat(array);
                _this.refresh();
                _this.scrollBottom();
            },0);
        });
    };

    Panel.prototype = {
        addLines: function(lines) {
            this.log = this.log.concat(lines);
            this.refresh();
        },
        play: function() {
            this.status = 'PLAYING';
            this.log = [];
            this.socket.emit('start', './' + (this.config.path ?  this.config.path + '/' : '') + this.config.file);
        },
        pause: function() {
            this.status = 'PAUSED';
            this.socket.emit('pause');
        },
        close: function() {
            this.socket.io.disconnect();
        },
        refresh: function() {
            var searchText = this.searchText;
            if (searchText) {
                this.filteredLog = this.log.filter(function(line){
                    return line.value.indexOf(searchText) !== -1;
                });
            }
            else {
                this.filteredLog = angular.copy(this.log);
            }
        },
        setFile: function(live, date) {
            if (live) {
                this.file = this.config.file;
            }
            else {
                this.file = this.config.file + '-' + this.date;
            }
        },
        onReady: function(callback) {
            this.socket.emit('checkfile', {
                path: this.config.path,
                file: this.config.file
            });
            this.notifyReady = callback;
        },
        onError: function(callback) {
            this.notifyError = callback;
        },
        setScrollBottom: function(func) {
            this.$parent.panel.notifyScrollBottom = func;
        },
        scrollBottom: function() {
            if (this.notifyScrollBottom) {
                this.notifyScrollBottom();
            }
        }
    };

    return Panel;
});
