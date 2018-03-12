/**
 * 1.慢事件记录
 * 2.页面资源每天汇总
 */
'use strict'
var Service = require('@flyme/skynet-db')

Service.setOptions('occasional');

const LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');
class ErrorDeal{
  constructor(){
    this['androidReport'] = {};//处理后的docs存储
    this['androidReport-save'] = 0;//用于save操作计数，为了实现异步的多个save操作完成后，执行对应的操作
    this['androidReport-count'] = 0;//原数据表扫描的记录数
  }
  doSave(allCompleteFn, gtype, type, project, doc){
    var _gtype = `${gtype}-save`;
    this[_gtype]++;
    Service.saveSimple(`job-${type}`, doc, () =>{
      this[_gtype]--;
      if(this[_gtype] == 0){
        allCompleteFn && allCompleteFn();
      }
    });
  }
  doClear(project, type, callback){
    this.closeDb(project);
    callback && callback(this['androidReport-count']);
  }
  closeDb(project){
    Service.closeConnection('androidReport', '');
  }
  finishDeal(type, callback, emailDeal){
    var map = this[type], temp = null;
    for(var p in map){
      temp = map[p];
      delete temp._id;
      delete temp.__v;
      emailDeal && emailDeal.dealAndroidReportItem(temp, temp.apiName);
      this.doSave(() => {
        // emailDeal && emailDeal.dealAndroidReportTotal({
        //   amount: this['androidReport-count']
        // }, temp.apiName);
        this.doClear(temp.project, type, callback);
      }, type, 'androidReport', temp.project, temp);
    }
  }
  startDeal(doc, project, type){
    this['androidReport-count']++;
    var key = `${doc.project}-${doc.apiName}-${doc.message}`,
        temp = null,
        map = this[type];
    if(!map[key]){
      map[key] = doc._doc;
    }else{
      temp = map[key];
      if(temp._reportServerTime < doc._doc._reportServerTime){
        temp._reportServerTime = doc._doc._reportServerTime;
      }
      if(!temp.amount){
        temp.amount = 0;
      }
      temp.amount += 1;
    }
  }
}
module.exports = ErrorDeal;
