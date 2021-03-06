(function () {
  'use strict';
  
  angular.module('nywton.chess', ['nywton.chessboard'])
  
  .service('NywtonChessGameService', ['$log', function ChessGameService($log) {
    this.onDragStart = function(game, source, piece, position, orientation) {
      $log.debug('lift piece ' + piece + ' from ' + source + ' - ' + position + ' - ' + orientation);
      if (game.game_over() === true ||
          (game.turn() === 'w' && piece.search(/^b/) !== -1) ||
          (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
      }
      return true;
    };
  
    this.onDrop = function(game, board, source, target) {
        
        var makeMove = function(promotionPiece){
            return game.move({
                from: source,
                to: target,
                promotion: promotionPiece
            });          
        };
      
        if (source == target)
            return 'snapback';

        var sp = game.get(source);
        if (sp && sp.type == 'p' && ((sp.color == 'w' && source[1] == '7') || (sp.color == 'b' && source[1] == '2'))) {
            var color = null;
            if (sp.color == 'w' && source[1] == '7')
                color = 'white';
            else if (sp.color == 'b' && source[1] == '2') {
                color = 'black';
            }
            if (color) {
                board.choosePromotion(color, function (promotionPiece) {
                    makeMove(promotionPiece)
                    board.position(game.fen());
                });
                return 'snapback';
            }            
        }
        else {
            var move = makeMove('q');         
            if (move === null) {                
                return 'snapback';
            }            
        }
    };
    
    this.onSnapEnd = function(game, board, source, target, piece) {
      $log.debug('onSnapEnd ' + piece + ' from ' + source + ' to ' + target);
      // update the board position after the piece snap 
      // for castling, en passant, pawn promotion
      board.position(game.fen());
    };
    
    this.makeRandomMove = function (game, board) {
      $log.info('position: ' + game.fen());
      var moves = game.moves();
      var move = moves[Math.floor(Math.random() * moves.length)];
      game.move(move);
      
      var useAnimations = true;
      board.position(game.fen(), useAnimations);
      $log.info('move: ' + move);
    };
  }])

  .directive('nywtonChessgame', ['$window','$log', 'NywtonChessGameService', function($window, $log, ChessGameService) {

    var directive = {
      restrict: 'E',
      template: '<div>' +
        '<nywton-chessboard board="board" position="\'start\'" showNotation="true" draggable="true" on-change="onChangeB" on-drag-start-cb="onDragStart" on-snap-end="onSnapEnd" on-drop="onDrop"></nywton-chessboard>' +
      '</div>',
      replace:false,
      scope : {
        'name': '@',
        'game': '=',
        'board': '=',
        'onChange': '&'
      },
      controller: ['$scope', function chessgame($scope) {
        var game = $scope.game = new $window.Chess();
        game.name = $scope.name || 'game' + $scope.$id;
        
        this.game = function gameF() {
          return $scope.game;
        };
        this.board = function boardF() {
          return $scope.board;
        };
        
        $scope.onDragStart = function onDragStartF(source, piece, position, orientation) {
          return ChessGameService.onDragStart($scope.game, source, piece, position, orientation);
        };
        $scope.onSnapEnd = function onSnapEndF(source, target, piece) {
          return ChessGameService.onSnapEnd($scope.game, $scope.board, source, target, piece);
        };
        $scope.onDrop = function onDropF(source, target) {
            return ChessGameService.onDrop($scope.game,  $scope.board, source, target);
        };
        $scope.onChangeB = function onChangeF(oldPosition, newPosition) {            
            if ($scope.onChange)
                return $scope.onChange()({oldP: oldPosition, newP: newPosition});            
            return angular.noop(oldPosition, newPosition);
        };
      }],
    };
    
    return directive;
  }])

  .directive('nywtonAllowOnlyLegalMoves', ['$window', 'NywtonChessGameService', function($window, ChessGameService) {

    var directive = {
      restrict: 'A',
      priority: 1,
      require: 'nywtonChessboard',
      controller: [function AllowOnlyLegalMovesCtrl() {
        var game = new $window.Chess();

        this.onDragStart = function onDragStartF(source, piece, position, orientation) {
          return ChessGameService.onDragStart(game, source, piece, position, orientation);
        };
        this.getOnSnapEndFunc = function getOnSnapEndFuncF(getBoard) {
          return function onSnapEndF(source, target, piece) {
            return ChessGameService.onSnapEnd(game, getBoard(), source, target, piece);
          };
        };
        this.onDrop = function onDropF(source, target) {
          return ChessGameService.onDrop(game, source, target);
        };
        this.onChange = function onChangeF() {
        };
      }],
      link: function link($scope, $element, $attrs, $ctrl) {
        var thisCtrl = $element.controller('nywtonAllowOnlyLegalMoves');
        
        // board is not ready yet.. so we have to cheat a bit.
        var getBoard = function getBoardF() {
          return $ctrl.board();
        };
        
        $ctrl.config_push(['onDragStart', thisCtrl.onDragStart]);
        $ctrl.config_push(['onSnapEnd', thisCtrl.getOnSnapEndFunc(getBoard)]);
        $ctrl.config_push(['onDrop', thisCtrl.onDrop]);
        $ctrl.config_push(['onChange', thisCtrl.onChange]);
      },
    };
    
    return directive;
  }])
  
  .directive('nywtonRandomVsRandom', ['$timeout','$window','NywtonChessGameService', function($timeout, $window, ChessGameService) {
    var directive = {
      restrict: 'A',
      priority: 1,
      require: 'nywtonChessgame',
      controller: ['$scope', function randomVsRandom($scope) {
        var _MIN_INTERVAL = 100;
        var interval = 1000;
        var timeoutPromise = null;
        
        this.setInterval = function getIntervalF(t) {
          interval = t >= _MIN_INTERVAL ? t : interval;
        };
        
        this.makeRandomMoveDelayedInvocation = function makeRandomMoveDelayedInvocationF(game, board) {
          $timeout.cancel(timeoutPromise);
          timeoutPromise = $timeout(function makeRandomMoveF() {
            // exit if the game is over
            if (game.game_over() !== true) {
              ChessGameService.makeRandomMove(game, board);
              makeRandomMoveDelayedInvocationF(game, board);
            }
          }, interval);
        };
        
        $scope.$on('$destroy', function onDestroyF() {
          $timeout.cancel(timeoutPromise);
        });
      }],
      link: function link($scope, $element, $attrs, $ctrl) {
        var thisCtrl = $element.controller('nywtonRandomVsRandom');
        
        $attrs.$observe('interval', function(val) {
          if(val) {
            var parsedValue = $window.parseInt(val);
            if(parsedValue === parsedValue && angular.isNumber(parsedValue)) {
              thisCtrl.setInterval(parsedValue);
            }
          }
        });
        
        $scope.$watch(function() {
          return $ctrl.game() && $ctrl.game().game_over();
        }, function(newValue, oldValue) {
          // first run or restarted
          if((oldValue === false && newValue === false) ||
              (newValue === false && oldValue === true)) {
            $timeout(function() {
              var game = $ctrl.game();
              var board = $ctrl.board();
              thisCtrl.makeRandomMoveDelayedInvocation(game, board);
            }, 0);
          }
        });
      },
    };
    
    return directive;
  }])

  .directive('nywtonChessAutoresize', ['$window', '$timeout', function ($window, $timeout) {
      var directive = {
          restrict: 'A',
          priority: 1,
          require: 'nywtonChessgame',
          link: function link($scope, $element, $attrs, $ctrl) {
              var resizeBoard = function resizeBoardF() {
                  if (angular.isDefined($ctrl.board())) {
                      $ctrl.board().resize();
                  }
              };
              var resizeTimeoutPromise;
              angular.element($window).bind('resize', function () {
                  $timeout.cancel(resizeTimeoutPromise);
                  resizeTimeoutPromise = $timeout(resizeBoard, 113);
              });
              $scope.$on('$destroy', function onDestroyF() {
                  $timeout.cancel(resizeTimeoutPromise);
              });
          },
      };

      return directive;
  }]);

})();