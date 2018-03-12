/**
 * 1.记录慢事件
 * 2.累加
 * 3.页面小时pv
 * 4.页面小时timeline
 */
'use strict'
var Service = require('@flyme/skynet-db')
var LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');
var Async = require('async');

Service.setOptions('occasional');

class TimingDeal{
  constructor(){
    this['daily-timing'] = {};//处理后的docs存储
    this['daily-timing-save'] = 0;//用于save操作计数，为了实现异步的多个save操作完成后，执行对应的操作
    this['daily-timing-count'] = 0;//原数据表扫描的记录数
    this['slow-timing-count'] = 0;
    this['all-page'] = {};//页面统计
  }
  recordSlow(doc, project){//慢事件记录
    if(doc.le - doc.ns > 10000 || doc.end - doc.ns > 10000){
      delete doc._id;
      delete doc.__v;
      Service.save('slow-timing', project, doc);
      this['slow-timing-count']++;
    }
  }
  doSave(allCompleteFn, gtype, type, project, doc){
    var _gtype = `${gtype}-save`;
    this[_gtype]++;
    Service.save(type, project, doc, () => {
      this[_gtype]--;
      if(this[_gtype] == 0){
        allCompleteFn && allCompleteFn();
      }
    });
  }
  doClear(project, type, callback){
    this.closeDb(project);
    callback && callback(this[`${type}-count`]);
  }
  finishDeal(project, type, callback, emailDeal){
    var map = this[type], temp = null, one = null, page = null;
    for(var p in map){
      temp = map[p];
      this.doSave(() => {//页面小时pv
        this.doClear(project, type, callback);
      }, type, 'job-pv', project, temp);
      page = temp._page;
      one = temp.doc;
      one._page = page;
      this['all-page'][`${page}_${project}`] = {
        'project': project,
        '_page': page
      };
      one._reportServerTime = temp._reportServerTime;
      this.doSave(() => {//页面小时timeline
        if(type == 'daily-timing'){
          emailDeal && emailDeal.dealTimingTotal({
            amount: this['slow-timing-count'],
            total: this['daily-timing-count']
          }, project);
          Service.findOneAndUpdate('manage-projects', '', {
            slowTimingAmount: this['slow-timing-count']
          }, {
            name: project
          }, () => {
            LogUtil.log('manage-projects(', project, ')：set slowTimingAmount to', this['slow-timing-count']);
          }, function(){
            Service.closeConnection('manage-projects', '');
          });
        }
        this.doClear(project, type, callback);
      }, type, 'job-timing', project, one);
    }
    this.doAllPage(this['all-page'], type, callback, project);
  }
  doAllPage(map, type, callback, project){
    var fns = [];
    for(var p in map){
      fns.push(this.doOnePage(map[p], type, callback, project));
    }
    Async.series(
      fns,
      function(err, results){}
    );
  }
  doOnePage(obj, type, callback, project){
    return (_callback) => {
      Service.find('job-all-page', '', obj, (r) => {
        if(!r || !r.length){
          this.doSave(() => {//页面统计
            this.doClear(project, type, callback);
          }, type, 'job-all-page', '', obj);
        }
      }, (err) => {
        _callback(null, null);
        if(err){
          LogUtil.error(`db: job-all-page,  time: ${new Date().toString()},  action: find, err: ${err.message}`);
        }
      });
    };
  }
  closeDb(project){
    Service.closeConnectionPreDay('timing', project);
    Service.closeConnection('job-pv', project);
    Service.closeConnection('job-all-page', '');
    Service.closeConnection('job-timing', project);
    Service.closeConnection('slow-timing', project);
  }
  startDeal(doc, project, type){
    this['daily-timing-count']++;
    var key = `${doc._page}-${new Date(doc._reportServerTime).getHours()}`,
        _doc = doc._doc,
        temp = null,
        map = this[type],
        rs = (doc['fs'] - doc['ns']) || 0,
        net = (doc['rese'] - doc['dls']) || 0,
        load = (doc['le'] - doc['rese']) || 0,
        other = doc['end'] ? (doc['end'] - doc['le']) : 0;
    _doc.readyStart = rs;
    _doc.net = net;
    _doc.load = load;
    _doc.other = other;
    this.recordSlow(_doc, project);
    if(rs == undefined || net == undefined || load == undefined || other == undefined){
      return;
    }
    if(!map[key]){
      map[key] = {
        amount: 1,
        _page: _doc._page,
        _reportServerTime: doc._reportServerTime,
        doc: {
          readyStart: rs,
          net: net,
          load: load,
          other: other
        }
      };
    }else{
      temp = map[key].doc;
      map[key].amount += 1;
      temp['readyStart'] = (temp['readyStart'] + rs)/2;
      temp['net'] = (temp['net'] + net)/2;
      temp['load'] = (temp['load'] + load)/2;
      temp['other'] = (temp['other'] + other)/2;
    }
  }
}
module.exports = TimingDeal;
