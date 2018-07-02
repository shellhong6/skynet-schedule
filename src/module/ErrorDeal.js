/**
 * 1.慢事件记录
 * 2.页面资源每天汇总
 */
'use strict'
var Service = require('@flyme/skynet-db')



const LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');
class ErrorDeal{
  constructor(){
    this['job-jsError'] = {};//处理后的docs存储
    this['job-jsError-save'] = 0;//用于save操作计数，为了实现异步的多个save操作完成后，执行对应的操作
    this['job-jsError-count'] = 0;//原数据表扫描的记录数
  }
  doSave(allCompleteFn, gtype, type, project, doc){
    var _gtype = `${gtype}-save`;
    this[_gtype]++;
    Service.save(type, project, doc, () =>{
      this[_gtype]--;
      if(this[_gtype] == 0){
        allCompleteFn && allCompleteFn();
      }
    });
  }
  doClear(project, type, callback){
    callback && callback(this['job-jsError-count']);
  }
  finishDeal(project, type, callback, emailDeal){
    var map = this[type], temp = null;
    for(var p in map){
      temp = map[p];
      delete temp._id;
      delete temp.__v;
      emailDeal && emailDeal.dealErrorItem(temp, project);
      this.doSave(() => {
        emailDeal && emailDeal.dealErrorTotal({
          amount: this['job-jsError-count']
        }, project);
        Service.findOneAndUpdate('manage-projects', '', {
          errorAmount: this[`${type}-count`]
        }, {
          name: project
        }, () => {
          LogUtil.log('manage-projects(', project, ')：set errorAmount to', this[`${type}-count`]);
        }, function(){
        });
        this.doClear(project, type, callback);
      }, type, 'job-jsError', project, temp);
    }
  }
  startDeal(doc, project, type){
    this['job-jsError-count']++;
    var key = `${doc._page}-${doc.stack}`,
        temp = null,
        map = this[type];
    if(!map[key]){
      map[key] = doc._doc;
      map[key].amount = 1;
    }else{
      temp = map[key];
      if(temp._reportServerTime < doc._doc._reportServerTime){
        temp._reportServerTime = doc._doc._reportServerTime;
      }
      temp.amount += 1;
    }
  }
}
module.exports = ErrorDeal;
