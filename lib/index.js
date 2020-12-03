'use strict';

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var path = require('path');
var chalk = require('chalk');
var _ = require('lodash');
var AliOSS = require('ali-oss');
var Buffer = require('buffer').Buffer;
var zlib = require('zlib');

var defaultConfig = {
  auth: {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: ''
  },
  retry: 3,
  existCheck: true,
  ossBaseDir: 'auto_upload_ci',
  project: '',
  prefix: '',
  exclude: /.*\.html$/,
  enableLog: false,
  ignoreError: false,
  removeMode: true,
  gzip: true,
  envPrefix: '',
  options: undefined,
  acl: ''
};

var red = chalk.red;
var green = chalk.bold.green;

module.exports = function () {
  function WebpackAliOSSPlugin(cfg) {
    (0, _classCallCheck3.default)(this, WebpackAliOSSPlugin);

    var envConfig = {
      auth: {
        accessKeyId: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_ACCESS_KEY_ID'],
        accessKeySecret: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_ACCESS_KEY_SECRET'],
        bucket: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_BUCKET'],
        region: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_REGION']
      },
      enableLog: extraEnvBoolean(process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_ENABLE_LOG']),
      ignoreError: extraEnvBoolean(process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_IGNORE_ERROR']),
      removeMode: extraEnvBoolean(process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_REMOVE_MODE']),
      ossBaseDir: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_OSS_BASE_DIR'],
      prefix: process.env[((cfg || {}).envPrefix || defaultConfig.envPrefix) + 'WEBPACK_ALIOSS_PLUGIN_PREFIX']
    };
    this.config = _.mergeWith(_.cloneDeep(defaultConfig), envConfig, cfg || {}, configMergeCustomizer);
    if (typeof this.config.retry !== 'number' || this.config.retry < 0) {
      this.config.retry = 0;
    }
    this.calcPrefix();
    this.debug('默认配置:', defaultConfig);
    this.debug('环境变量配置:', envConfig);
    this.debug('项目配置:', cfg);
    this.debug('最终使用的配置:', this.config);

    this.client = AliOSS(this.config.auth);
  }

  (0, _createClass3.default)(WebpackAliOSSPlugin, [{
    key: 'apply',
    value: function apply(compiler) {
      var _this = this;

      compiler.plugin('emit', function (compilation, cb) {
        var files = _this.pickupAssetsFiles(compilation);
        log('' + green('\nOSS 上传开始......'));
        _this.uploadFiles(files, compilation).then(function () {
          log('' + green('OSS 上传完成\n'));
          cb();
        }).catch(function (err) {
          log(red('OSS 上传出错') + '::: ' + red(err.code) + '-' + red(err.name) + ': ' + red(err.message));
          _this.config.ignoreError || compilation.errors.push(err);
          cb();
        });
      });
    }
  }, {
    key: 'calcPrefix',
    value: function calcPrefix() {
      if (this.finalPrefix) return this.finalPrefix;

      if (this.config.prefix) {
        this.finalPrefix = this.config.prefix;
      } else {
        this.config.project = this.config.project || this.npmProjectName();
        if (!this.config.project) {
          warn('\u4F7F\u7528\u9ED8\u8BA4\u4E0A\u4F20\u76EE\u5F55: ' + this.config.ossBaseDir);
          this.finalPrefix = this.config.ossBaseDir;
        } else {
          this.finalPrefix = this.config.ossBaseDir + '/' + this.config.project;
        }
      }
      this.debug('使用的 OSS 目录:', this.finalPrefix);
      return this.finalPrefix;
    }
  }, {
    key: 'uploadFiles',
    value: function uploadFiles(files, compilation) {
      var _this2 = this;

      var i = 1;
      return _promise2.default.all(_.map(files, function (file) {
        file.$retryTime = 0;
        var uploadName = (_this2.calcPrefix() + '/' + file.name).replace('//', '/');

        if (_this2.config.existCheck !== true) {
          return _this2.uploadFile(file, i++, files, compilation, uploadName);
        } else {
          return new _promise2.default(function (resolve, reject) {
            _this2.client.list({
              prefix: uploadName,
              'max-keys': 50
            }).then(function (res) {
              var arr = (res.objects || []).filter(function (item) {
                return item.name === uploadName;
              });
              if (arr && arr.length > 0) {
                var timeStr = getTimeStr(new Date(res.objects[0].lastModified));
                log(green('已存在,免上传') + ' (\u4E0A\u4F20\u4E8E ' + timeStr + ') ' + ++i + '/' + files.length + ': ' + uploadName);
                _this2.config.removeMode && delete compilation.assets[file.name];
                resolve();
              } else {
                throw new Error('not exist & need upload');
              }
            }).catch(function () {
              _this2.uploadFile(file, i++, files, compilation, uploadName).then(function () {
                for (var _len = arguments.length, rest = Array(_len), _key = 0; _key < _len; _key++) {
                  rest[_key] = arguments[_key];
                }

                return resolve(rest);
              }).catch(function (err) {
                return reject(err);
              });
            });
          });
        }
      }));
    }
  }, {
    key: 'uploadFile',
    value: function uploadFile(file, idx, files, compilation, uploadName) {
      var _this3 = this;

      return new _promise2.default(function (resolve, reject) {
        var fileCount = files.length;
        getFileContentBuffer(file, _this3.config.gzip).then(function (contentBuffer) {
          var opt = _this3.getOptions(_this3.config.gzip);
          var self = _this3;
          function _uploadAction() {
            var _this4 = this;

            file.$retryTime++;
            log('\u5F00\u59CB\u4E0A\u4F20 ' + idx + '/' + fileCount + ': ' + (file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''), uploadName);
            self.client.put(uploadName, contentBuffer, opt).then(function () {
              log('\u4E0A\u4F20\u6210\u529F ' + idx + '/' + fileCount + ': ' + uploadName);
              self.config.removeMode && delete compilation.assets[file.name];

              if (_this4.config.acl) {
                self.client.putACL(uploadName, _this4.config.acl).then(function () {
                  return resolve();
                });
              } else {
                resolve();
              }
            }).catch(function (err) {
              if (file.$retryTime < self.config.retry + 1) {
                _uploadAction();
              } else {
                reject(err);
              }
            });
          }
          _uploadAction();
        }).catch(function (err) {
          reject(err);
        });
      });
    }
  }, {
    key: 'getOptions',
    value: function getOptions(gzip) {
      var optValid = _.isPlainObject(this.config.options);
      if (gzip) {
        if (optValid) {
          if (!this.config.options.headers) this.config.options.headers = {};
          this.config.options.headers['Content-Encoding'] = 'gzip';
          return this.config.options;
        } else {
          return {
            headers: { 'Content-Encoding': 'gzip' }
          };
        }
      } else {
        return optValid ? this.config.options : undefined;
      }
    }
  }, {
    key: 'pickupAssetsFiles',
    value: function pickupAssetsFiles(compilation) {
      var matched = {};
      var keys = (0, _keys2.default)(compilation.assets);
      for (var i = 0; i < keys.length; i++) {
        if (!this.config.exclude.test(keys[i])) {
          matched[keys[i]] = compilation.assets[keys[i]];
        }
      }
      return _.map(matched, function (value, name) {
        return {
          name: name,
          path: value.existsAt,
          content: value.source()
        };
      });
    }
  }, {
    key: 'npmProjectName',
    value: function npmProjectName() {
      try {
        var pkg = require(path.resolve(process.env.PWD, 'package.json'));
        return pkg.name;
      } catch (e) {
        return '';
      }
    }
  }, {
    key: 'debug',
    value: function debug() {
      this.config.enableLog && log.apply(undefined, arguments);
    }
  }]);
  return WebpackAliOSSPlugin;
}();

function extraEnvBoolean(val) {
  if (val && val === 'true') {
    return true;
  }
  if (val && val === 'false') {
    return false;
  }
}

function getTimeStr(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes();
}

function getFileContentBuffer(file, gzipVal) {
  var gzip = typeof gzipVal === 'number' || gzipVal === true ? true : false;
  var opts = typeof gzipVal === 'number' ? { level: gzipVal } : {};
  if (!gzip) return _promise2.default.resolve(Buffer.from(file.content));
  return new _promise2.default(function (resolve, reject) {
    zlib.gzip(Buffer.from(file.content), opts, function (err, gzipBuffer) {
      if (err) reject(err);
      resolve(gzipBuffer);
    });
  });
}

function configMergeCustomizer(objVal, srcVal) {
  if (_.isPlainObject(objVal) && _.isPlainObject(srcVal)) {
    return _.merge(objVal, srcVal);
  } else {
    return srcVal;
  }
}

function log() {
  var _console;

  for (var _len2 = arguments.length, rest = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
    rest[_key2] = arguments[_key2];
  }

  (_console = console).log.apply(_console, [chalk.bgMagenta('[webpack-alioss-plugin]:')].concat(rest));
}
function warn() {
  var _console2;

  for (var _len3 = arguments.length, rest = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
    rest[_key3] = arguments[_key3];
  }

  (_console2 = console).warn.apply(_console2, [chalk.bgMagenta('[webpack-alioss-plugin]:')].concat(rest));
}