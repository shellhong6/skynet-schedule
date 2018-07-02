/**
 * 1.慢事件记录
 * 2.页面资源每天汇总
 */
'use strict'
var Service = require('@flyme/skynet-db')
var LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');



class ResourcesDeal{
  constructor(){
    this['daily-resources'] = {};//处理后的docs存储
    this['daily-resources-save'] = 0;//用于save操作计数，为了实现异步的多个save操作完成后，执行对应的操作
    this['daily-resources-count'] = 0;//原数据表扫描的记录数
    this['daily-slow-resources-count'] = 0;//原数据表扫描的记录数
  }
  transResources(doc, callback){
    var list = JSON.parse(doc.list);
    list.forEach(function(item){
      item._page = doc._page;
      item._reportServerTime = doc._reportServerTime;
      !item.amount && (item.amount = 1);
      item.dur = parseInt(item.dur);
      item.dur < 0 && (item.dur = 0);
      callback && callback(item);
    });
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
    callback && callback(this['daily-resources-count']);
  }
  recordSlow(doc, project){//慢事件记录
    if(doc.dur > 2000){
      this['daily-slow-resources-count']++;
      // Service.save('slow-resources', project, doc);
    }
  }
  finishDeal(project, type, callback, emailDeal){
    var map = this[type], temp = null;
    emailDeal && emailDeal.dealResourceTotal({
      amount: this['daily-slow-resources-count'],
      total: this['daily-resources-count']
    }, project);
    for(var p in map){
      temp = map[p];
      this.doSave(() => {
        this.doClear(project, type, callback);
      }, type, 'job-resources', project, temp);
    }
  }
  startDeal(doc, project, type){
    this['daily-resources-count']++;
    this.transResources(doc, (item) => {
      this.recordSlow(item, project);
      var domain = item.name.match(/https?\:\/\/([^:/?#&]+)|([^:/?#&]+)/),
          key = item.type,
          temp = null,
          map = this[type];
      if(domain && domain.length > 2){
        domain = domain[1] || domain[2];
      }else{
        domain = 'unknow';
        LogUtil.printFirstError(item.name, item.name);
      }
      key = `${key}-${domain}`;
      if(!item.dur || !item.amount){
        return;
      }
      if(!map[key]){
        map[key] = item;
      }else{
        temp = map[key];
        temp.amount += item.amount;
        temp.dur = (item.dur + temp.dur)/(item.amount + 1);
      }
    });
  }
}
module.exports = ResourcesDeal;
