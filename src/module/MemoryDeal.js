/**
 * 1.大缓存占用事件记录
 * 2.累加
 * 3.页面memory每天汇总
 */
'use strict'
var Service = require('@flyme/skynet-db')
var LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');

Service.setOptions('occasional');

class MemoryDeal{
  constructor(){
    this['daily-memory'] = {};//处理后的docs存储
    this['daily-memory-save'] = 0;//用于save操作计数，为了实现异步的多个save操作完成后，执行对应的操作
    this['daily-memory-count'] = 0;//用于原数据表扫描的记录数记录
    this['big-memory-count'] = 0;
  }
  closeDb(project){
    Service.closeConnectionPreDay('memory', project);
    Service.closeConnection('big-memory', project);
    Service.closeConnection('job-memory', project);
  }
  doSave(allCompleteFn, gtype, type, project, doc){
    var _gtype = `${gtype}-save`;
    this[_gtype]++;
    var promise = Service.save(type, project, doc, () => {
      this[_gtype]--;
      if(this[_gtype] == 0){
        allCompleteFn && allCompleteFn();
      }
    });
  }
  doClear(project, type, callback){
    this.closeDb(project);
    callback && callback(this['daily-memory-count']);
  }
  recordBig(doc, project){//大缓存占用事件记录
    if(doc.used > (doc.limit) * .8){
      delete doc._id;
      delete doc.__v;
      Service.save('big-memory', project, doc);
      this['big-memory-count']++;
    }
  }
  finishDeal(project, type, callback, emailDeal){
    var map = this[type], one = null, temp = null;
    for(var p in map){
      temp = map[p];
      one = temp.doc;
      one._page = temp._page;
      one._reportServerTime = temp._reportServerTime;
      this.doSave(() => {
        if(type == 'daily-memory'){
          emailDeal && emailDeal.dealMemoryTotal({
            amount: this['big-memory-count'],
            total: this['daily-memory-count']
          }, project);
          Service.findOneAndUpdate('manage-projects', '', {
            bigMemoryAmount: this['big-memory-count']
          }, {
            name: project
          }, () => {
            LogUtil.log('manage-projects(', project ,')：set bigMemoryAmount to', this['big-memory-count']);
          }, function(){
            Service.closeConnection('manage-projects', '');
          });
        }
        this.doClear(project, type, callback);
      }, type, 'job-memory', project, one);
    }
  }
  startDeal(doc, project, type){
    this['daily-memory-count']++;
    var key = `${doc._page}-${new Date(doc._reportServerTime).getHours()}`,
        temp = null,
        _doc = doc._doc,
        map = this[type];
    this.recordBig(_doc, project);
    if(!map[key]){
      map[key] = {
        _page: _doc._page,
        _reportServerTime: _doc._reportServerTime,
        doc: _doc
      };
      delete _doc._imei;
      delete _doc._uuid;
      delete _doc._page;
      delete _doc._reportServerTime;
      delete _doc._id;
      delete _doc.__v;
    }else{
      temp = map[key].doc;
      for(var p in temp){
        if(!_doc[p]){
          continue;
        }
        if(!temp[p]){
          temp[p] = _doc[p];
          continue;
        }
        temp[p] = (temp[p] + _doc[p])/2;
      }
    }
  }
}
module.exports = MemoryDeal;
