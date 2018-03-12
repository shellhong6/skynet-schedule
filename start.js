const Schedule = require('node-schedule');
const Service = require('@flyme/skynet-db');
const Config = require('@flyme/skynet-db/lib/config.js');
const TimingDeal = require('./src/module/TimingDeal.js');
const ResourcesDeal = require('./src/module/ResourcesDeal.js');
const MemoryDeal = require('./src/module/MemoryDeal.js');
const ErrorDeal = require('./src/module/ErrorDeal.js');
const AndroidErrorDeal = require('./src/module/AndroidErrorDeal.js');
const SweepJob = require('./src/sweep/SweepJob.js');
const Mongoose = require('mongoose');
const Async = require('async');
const TimeUtil = require('@flyme/skynet-utils/lib/timeUtil.js');
const BaseUtil = require('@flyme/skynet-utils/lib/baseUtil.js');
const LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');
const Fs = require('fs');
const Path = require('path');
const EmailDeal = require('./src/module/EmailDeal');

Service.setOptions('occasional');

const TIMEOUT = 6e5;

var sweepJob = new SweepJob('config', 'log');

var dbJob = {
  log(fn, type){
    LogUtil.log(`${fn} ${type}, time: ${new Date()}`);
  },
  doDeal(project, type, obj, fnName, callback){
    var _type = type.replace(/daily-|job-/, '');
    this.log(fnName + ' ' + project + '-' +  _type, ' start');
    Service.travelAllPreDay(_type, project, function(doc){
      obj.startDeal(doc, project, type);
    }, () => {
      obj.finishDeal(project, type, (count) => {
        this.log(fnName + ' ' + project + '-' + _type, ' end, count:' + count);
      }, EmailDeal);
      callback && callback();
    });
  },
  doDrop(project, type, callback){
    var t = TimeUtil.get2DayAgo();
    var name = `${type}-${project}-${t.getFullYear()}${t.getMonth() + 1}${t.getDate()}`;
    var url = Config.getDbUri(name);
    LogUtil.log('doDrop connect url ', url);
    Mongoose.connect(url, {
      user: Config.user,
      pass: Config.pass
    },function(){
      try{
        LogUtil.log('begin doDrop url: ', url);
        Mongoose.connection.db.dropDatabase();
        Mongoose.connection.db.close();
      }catch(e){
        LogUtil.log('action：doDrop failed', 'url: ', url, 'time：', new Date());
        LogUtil.log('error message：', e.message);
      }
      callback && callback();
    });
  },
  doDailyTiming(project, callback){
    this.doDeal(project, 'daily-timing', new TimingDeal(), 'doDailyTiming', callback);
  },
  doDailyResource(project, callback){
    this.doDeal(project, 'daily-resources', new ResourcesDeal(),'doDailyResource', callback);
  },
  doDailyMemory(project, callback){
    this.doDeal(project, 'daily-memory', new MemoryDeal(), 'doDailyMemory', callback);
  },
  doDailyJSError(project, callback){
    this.doDeal(project, 'job-jsError', new ErrorDeal(), 'doJSError', callback);
  },
  doDailyAndroidError(callback){
    var obj = new AndroidErrorDeal();
    this.log('doDailyAndroidError start');
    Service.travelAllPreDay('androidReport', '', function(doc){
      obj.startDeal(doc, doc.project, 'androidReport');
    }, () => {
      obj.finishDeal('androidReport', (count) => {
        this.log('finishDeal end, count:' + count);
      }, EmailDeal);
      callback && callback();
    });
  },
  dropDailyTiming(project, callback){
    this.doDrop(project, 'timing', callback);
  },
  dropDailyResource(project, callback){
    this.doDrop(project, 'resources', callback);
  },
  dropDailyMemory(project, callback){
    this.doDrop(project, 'memory', callback);
  },
  dropDailyJSError(project, callback){
    this.doDrop(project, 'jsError', callback);
  },
  dropDailyAndroidError(callback){
    var t = TimeUtil.get2DayAgo();
    var name = `androidReport-${t.getFullYear()}${t.getMonth() + 1}${t.getDate()}`;
    var url = Config.getDbUri(name);
    LogUtil.log('doDrop connect url ', url);
    Mongoose.connect(url, {
      user: Config.user,
      pass: Config.pass
    },function(){
      try{
        LogUtil.log('begin doDrop url: ', url);
        Mongoose.connection.db.dropDatabase();
        Mongoose.connection.db.close();
      }catch(e){
        LogUtil.log('action：doDrop failed', 'url: ', url, 'time：', new Date());
        LogUtil.log('error message：', e.message);
      }
      callback && callback();
    });
  },
  doJob(r, action, seriesCb){
    var name = '',
        fns = [],
        names = [];
    r.forEach((item) => {
      name = item.name || item;
      names.push(name);
      fns = fns.concat(this.createSeriesFns(name, action, seriesCb));
    });
    fns.push((callback) => {
      this[`${action}DailyAndroidError`](function(){
        callback && callback(null, 'androidReport');
      });
    });
    Async.series(
      fns,
      function(err, results){
        if(!names.length){
          return;
        }
        LogUtil.log(`job-finish ${action}DailyJob(${names.join(',')}), time: ${new Date()}------------------------------`)
        setTimeout(function(){
          if(action == 'do'){
            EmailDeal.doEmail();
            EmailDeal.doAndroidEmail();
          }
        }, 600000);//600000
      }
    );
  },
  doDailyJob(r){
    this.doJob(r, 'do', function(name, callback){
      var url = Path.resolve(__dirname, 'src/sweep/config');
      Fs.readFile(url, function(err, data){
        var obj = {};
        if(data){
          obj = JSON.parse(data);
        }
        var t = BaseUtil.formatTime(TimeUtil.get1DayAgo0Time(), 'yyyy-MM-dd');
        if(obj[t] === undefined){
          obj[t] = [];
        }
        obj[t].push(name);
        Fs.writeFile(url, JSON.stringify(obj), function(err){
          callback && callback();
        });
      });
    });
  },
  dropDailyJob(r){
    this.doJob(r, 'drop');
  },
  createSeriesFn(name, action, type){
      return (callback) => {
        LogUtil.log(`begin ${action}Daily${type}: `, name);
        this[`${action}Daily${type}`](name, function(){
          callback(null, type);
        });
      };
  },
  createSeriesFns(project, action, seriesCb){
    return [
      this.createSeriesFn(project, action, 'Timing'),
      this.createSeriesFn(project, action, 'Resource'),
      this.createSeriesFn(project, action, 'Memory'),
      this.createSeriesFn(project, action, 'JSError'),
      function(callback){
        LogUtil.log(`series-finish, project: ${project}, action: ${action}`);
        seriesCb ? seriesCb(project, callback) : callback();
      }
    ];
  },
  createSchedule(callback, h){
    Schedule.scheduleJob(`0 0 ${h} * * *`, function(){
      callback();
    });
  },
  createJobSchedule(h, action){
    this.createSchedule(() => {
      LogUtil.log(`schedule-begin ${action}, time: ${new Date()}`);
      if(sweepJob.doing){
        LogUtil.error(`want to ${action}, but sweepJob doing!`);
        return;
      }
      var name = '';
      Service.find('manage-projects', '', {}, (r) => {
        if(action == 'doDailyJob'){
          EmailDeal.dealEmail(r);
        }
        this[action](r);
      }, function(err){
        err && LogUtil.error(`schedule-fail ${action}(find manage-projects), time: ${new Date()}`);
      });
    }, h);
  },
  createAnalysisSchedule(){
    this.createJobSchedule(2, 'doDailyJob');
  },
  createDropSchedule(){
    this.createJobSchedule(5, 'dropDailyJob');
  }
};

dbJob.createAnalysisSchedule();
dbJob.createDropSchedule();

sweepJob.do(function(err, arr){
  if(!err){
    dbJob.doDailyJob(arr);
    setTimeout(function(){
      dbJob.dropDailyJob(arr);
    }, TIMEOUT);
  }
});

LogUtil.log('start monitor-manage-schedule success!');
