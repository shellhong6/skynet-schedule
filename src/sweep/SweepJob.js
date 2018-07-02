'use strict'
var Service = require('@flyme/skynet-db');
const Async = require('async');
const Fs = require('fs');
const Path = require('path');
const TimeUtil = require('@flyme/skynet-utils/lib/timeUtil.js');
const BaseUtil = require('@flyme/skynet-utils/lib/baseUtil.js');
const LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');



class SweepJob{
  constructor(path, logPath){
    this.path = Path.resolve(__dirname, path);
    this.logPath = Path.resolve(__dirname, logPath);
    this.doing = false;
  }
  do(callback){
    Async.series(
      [this.getSweepAmount.bind(this)],
      (err, results) => {
        LogUtil.log(`sweeplog, before doLeftJob, ${results[0]}`);
        if(!err && results[0] < 1){//一天只允许sweep 1次
          this.doLeftJob(callback);
        }
      }
    );
  }
  sweep(arr, callback){
    var fns = [];
    arr.forEach((item) => {
      fns = fns.concat(this.createSeriesFns(item));
    });
    fns.length && (this.doing = true);
    LogUtil.log(`sweeplog, before sweep, ${fns.length}`);
    Async.series(
      fns,
      (err, results) => {
        this.doing = false;
        callback && callback(err, arr);
      }
    );
  }
  getRemoteJob(callback){
    Service.find('manage-projects', '', {}, (r) => {
      callback(null, (r && r.length) ? r.map(item => {return item.name;}) : []);
    }, function(err){
      if(err){
        var mes = `getRemoteJob error, time: ${new Date()}, error message: ${err}`;
        LogUtil.error(mes);
        callback(mes, []);
      }
    });
  }
  getFinishedJob(callback){
    Fs.readFile(this.path, 'utf8', function(err, data) {
      if (err) {
        var mes = `getFinishedJob error, time: ${new Date()}, error message: ${err}`;
        LogUtil.error(mes);
        callback(mes, []);
      }
      var t = BaseUtil.formatTime(TimeUtil.get1DayAgo0Time(), 'yyyy-MM-dd');
      callback(null, JSON.parse(data)[t] || []);
    });
  }
  getSweepAmount(callback){
    Async.series(
      [(_callback) => {
        Fs.readFile(this.logPath, 'utf8', function(err, data) {
          if (err) {
            var mes = `getSweepAmount readFile error, time: ${new Date()}, error message: ${err}`;
            LogUtil.error(mes);
            _callback(mes, {});
          }
          var t = BaseUtil.formatTime(TimeUtil.get1DayAgo0Time(), 'yyyy-MM-dd');
          var json = JSON.parse(data);
          var amount = json[t] || 0;
          if(amount > 0){
            _callback('getSweepAmount readFile, amount > 1', {});
            return;
          }
          json[t] = amount + 1;
          _callback(null, {
            data: JSON.stringify(json),
            amount: amount
          });
        });
      }],
      (err, results) => {
        if(!err){
          var result = results[0];
          Fs.writeFile(this.logPath, result.data, function(_err){
            if (_err) {
              var mes = `getSweepAmount writeFile error, time: ${new Date()}, error message: ${_err}`;
              LogUtil.error(mes);
              callback(_err, 0);
            }
            callback(null, result.amount);
          })
        }
      }
    );
  }
  doLeftJob(callback){
    Async.parallel({
      remote: this.getRemoteJob.bind(this),
      finished: this.getFinishedJob.bind(this)
    }, (err, results) => {
      var remoteR = results.remote,
          finishedR = results.finished;
      if(remoteR && remoteR.length){
        this.sweep(
          remoteR.filter(function(item){
            return (finishedR.indexOf(item) == -1);
          }),
          callback
        );
      }
    });
  }
  doRemove(project, type, callback){
    var count = 0;
    LogUtil.log(`doRemove  ${type}-${project} start`);
    Service.travelAll(type, project, function(doc){
      Service.findByIdAndRemove(type, project, doc._id);
      count++;
    }, () => {
      LogUtil.log(`doRemove ${type}-${project} end, count: ${count}`);
      callback && callback(null, type);
    }, function(query){
      return query.where('_reportServerTime').gt(TimeUtil.get1DayAgo0Time() - 2000);
    });
  }
  createSeriesFn(project, type){
    return (callback) => {
      this.doRemove(project, type, callback);
    };
  }
  createSeriesFns(project, seriesCb){
    return [
      this.createSeriesFn(project, 'job-timing'),
      this.createSeriesFn(project, 'job-pv'),
      this.createSeriesFn(project, 'job-resources'),
      this.createSeriesFn(project, 'job-memory'),
      this.createSeriesFn(project, 'job-jsError'),
      this.createSeriesFn(project, 'big-memory'),
      this.createSeriesFn(project, 'slow-timing'),
      this.createSeriesFn(project, 'slow-resources'),
      function(callback){
        LogUtil.log(`series-finish, project: ${project}, action: sweep`);
        seriesCb ? seriesCb(project, callback) : callback();
      }
    ];
  }
}
module.exports = SweepJob;
