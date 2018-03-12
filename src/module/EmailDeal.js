const LogUtil = require('@flyme/skynet-utils/lib/logUtil.js');
const Service = require('@flyme/skynet-db');
const Async = require('async');

Service.setOptions('occasional');

const ERROR_ITEM_AMOUNT = 100;
const ANDROID_ERROR_ITEM_AMOUNT = 0;
const ANDROID_ERROR_TOTAL_AMOUNT = 0;
const ERROR_TOTAL_AMOUNT = 500;
const MEMORY_TOTAL_AMOUNT = 50;
const RESOURCE_TOTAL_AMOUNT = 0.05;
const TIMING_TOTAL_AMOUNT = 0.1;

var Emailjs = require('emailjs');
var _server = null;

const _getServer = function(){
  if(_server){
    return _server;
  }
  _server = Emailjs.server.connect({
     user:	"node_code",
    //  password: "appadmin*111",
     host:	"idcmail.meizu.com"
  });
  return _server;
}

var loop = {
  emailToProjects: {},
  errors: {},
  androidErrors: {},
  memories: {},
  res: {},
  timings: {}
};
var map = null;
var oldProjects = [];
var newProjects = [];

var EmailDeal = {
  init(){
    this.reset();

    this.baseMessage	= {
       text:	"skynet异常数据报表",
       from:	"魅族小N <node_code@meizu.com>",
       subject:	"skynet异常数据报表"
    };
  },
  send(attachment, to){
    var mes = Object.assign({},this.baseMessage, {
      attachment,
      to
    });
    var server = _getServer();
    server.send(mes, function(err, message) {
      if(err){
        LogUtil.error(`send email error: ${to}, message: ${err.message}`);
        return;
      }
       LogUtil.log(`send email success: ${to}`);
    });
  },
  getPrefixHtml(){
    return "" +
           "<html>" +
           "<table border='1' cellpadding='0' cellspacing='0' style='border-collapse: collapse;'>" +
           "<thead style='background-color:#d3e4f3;'>" +
           "<th height='30' width='150' style='text-align:center;'>项目名</th>" +
           "<th height='30' width='100' style='text-align:center;'>类型</th>" +
           "<th height='30' width='350' style='text-align:center;'>标题</th>" +
           "<th height='30' width='50' style='text-align:center;'>数量</th>" +
           "</thead>";
  },
  getPrefixAndroidHtml(){
    return "" +
           "<html>" +
           "<table border='1' cellpadding='0' cellspacing='0' style='border-collapse: collapse;'>" +
           "<thead style='background-color:#d3e4f3;'>" +
           "<th height='30' width='150' style='text-align:center;'>方法名</th>" +
           "<th height='30' width='100' style='text-align:center;'>项目名</th>" +
           "<th height='30' width='350' style='text-align:center;'>错误信息</th>" +
           "<th height='30' width='50' style='text-align:center;'>数量</th>" +
           "</thead>";
  },
  getEndHtml(){
    return "" +
           "</table>" +
           "</html>";
  },
  listToHtml(list){
    return list.map(item => this.itemToHtml(item)).join('');
  },
  androidListToHtml(list){
    return list.map(item => this.androidItemToHtml(item)).join('');
  },
  itemToHtml({project, type, title, amount, isStyle}){
    var style = "height='30'";
    if(isStyle){
      style += " style='background-color:#c5d6f7;'";
    }
    return "" +
           `<tr ${style}>` +
           `<td style='text-align:center;'>${project}</td>` +
           `<td style='text-align:center;'>${type}</td>` +
           `<td>${title}</td>` +
           `<td>${amount}</td>` +
           "</tr>";
  },
  androidItemToHtml({apiName, project, title, amount, isStyle}){
    var style = "height='30'";
    if(isStyle){
      style += " style='background-color:#c5d6f7;'";
    }
    return "" +
           `<tr ${style}>` +
           `<td style='text-align:center;'>${apiName}</td>` +
           `<td style='text-align:center;'>${project}</td>` +
           `<td>${title}</td>` +
           `<td>${amount}</td>` +
           "</tr>";
  },
  emptyToHtml(){
    return this.itemToHtml(
      {
        project: '&nbsp',
        type: '&nbsp',
        title: '&nbsp',
        amount: '&nbsp',
        isStyle: false
      });
  },
  dealErrorItem(error, project){
    if(error.amount > ERROR_ITEM_AMOUNT){
      if(!map.errors[project]){
        map.errors[project] = [];
      }
      map.errors[project].push({
        project: project,
        type: 'js_error',
        title: error.message,
        amount: error.amount,
        isStyle: false
      });
    }
  },
  dealAndroidReportItem(error, apiName){
    if(error.amount > ANDROID_ERROR_ITEM_AMOUNT){
      if(!map.androidErrors[apiName]){
        map.androidErrors[apiName] = [];
      }
      map.androidErrors[apiName].push({
        apiName: apiName,
        project: error.project,
        title: error.message,
        amount: error.amount,
        isStyle: false
      });
    }
  },
  // dealAndroidReportTotal(error, apiName){
  //   if(error.amount > ANDROID_ERROR_TOTAL_AMOUNT){
  //     if(!map.androidErrors[apiName]){
  //       map.androidErrors[apiName] = [];
  //     }
  //     map.androidErrors[apiName] = [{
  //       apiName: apiName,
  //       project: 'total',
  //       title: 'total',
  //       amount: error.amount,
  //       isStyle: false
  //     }].concat(map.androidErrors[apiName]);
  //   }
  // },
  dealErrorTotal(error, project){
    if(error.amount > ERROR_TOTAL_AMOUNT){
      if(!map.errors[project]){
        map.errors[project] = [];
      }
      map.errors[project] = [{
        project: project,
        type: 'js_error',
        title: 'total',
        amount: error.amount,
        isStyle: false
      }].concat(map.errors[project]);
    }
  },
  dealMemoryTotal(memory, project){
    if(memory.amount > MEMORY_TOTAL_AMOUNT){
      if(!map.memories[project]){
        map.memories[project] = [];
      }
      map.memories[project].push({
        project: project,
        type: 'big_memory',
        title: 'total',
        amount: memory.amount,
        isStyle: false
      });
    }
  },
  dealResourceTotal(res, project){
    if(res.amount  / res.total > RESOURCE_TOTAL_AMOUNT){
      if(!map.res[project]){
        map.res[project] = [];
      }
      map.res[project].push({
        project: project,
        type: 'slow_resource',
        title: 'total',
        amount: res.amount,
        isStyle: false
      });
    }
  },
  dealTimingTotal(timing, project){
    if(timing.amount / timing.total > TIMING_TOTAL_AMOUNT){
      if(!map.timings[project]){
        map.timings[project] = [];
      }
      map.timings[project].push({
        project: project,
        type: 'slow_timing',
        title: 'total',
        amount: timing.amount,
        isStyle: false
      });
    }
  },
  dealEmail(projects){
    var arr = [], etp = map.emailToProjects, name = null;
    projects.forEach(function(item){
      item = item._doc;
      name = item.name;
      if(oldProjects.indexOf(name) == -1){
        newProjects.push(name);
        oldProjects.push(name);
      }
      if(item.emails){
        arr = item.emails.split(',');
        arr.forEach(function(one){
          if(/[a-zA-Z0-9_\-\u4e00-\u9fa5]+\s<[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+>/.test(one)){
            if(!etp[one]){
              etp[one] = [];
            }
            etp[one].push(item.name);
          }
        });
      }
    });
  },
  reset(){
    map = JSON.parse(JSON.stringify(loop));
    newProjects = [];
    _server = null;
  },
  doAndroidItemEmail(project, emails){
    var  html = [],
         errorList = [],
         resutlList = [],
         {androidErrors} = map;
    Object.keys(androidErrors).forEach((apiName) => {
      errorList = androidErrors[apiName];
      if(errorList && errorList.length){
        if('default' != project && 'all' != project){
          errorList = errorList.filter((item, index) => {
            if(item.project == project){
              androidErrors[apiName].splice(index, 1);
              return true;
            }
            return false;
          });
        }
      }
      html.push(errorList ? this.androidListToHtml(errorList) : '');
      html.push(this.emptyToHtml());
    });
    if(html && html.length){
      html = this.getPrefixAndroidHtml() + html.join('') + this.getEndHtml();
      this.send([{data: html, alternative:true}], emails);
    }
  },
  doAndroidEmail(){
    LogUtil.log('begin doAndroidEmail skynet data!');
    Async.series(
      [this.remoteAndroidEmails.bind(this)],
      (err, results) => {
        if(!err){
          var emailInfo = results[0];
          if(emailInfo.all){
            this.doAndroidItemEmail('all', emailInfo.all);
            delete emailInfo.all;
          }
          Object.keys(emailInfo).forEach((project) => {
            if(project == 'default'){
              return;
            }
            this.doAndroidItemEmail(project, emailInfo[project]);
          });
          if(emailInfo.default){
            this.doAndroidItemEmail('default', emailInfo.default);
            delete emailInfo.default;
          }
        }
        this.reset();
      }
    );
  },
  remoteAndroidEmails(callback){
    Service.find('manage-config', '', {name: 'android_emails'}, (r) => {
      if(r && r.length){
        r = r[0]._doc;
        if(r.detail){
          LogUtil.log('has doAndroidEmail skynet data, detail: ', r.detail);
          callback && callback(null, JSON.parse(r.detail));
          return;
        }
      }
      LogUtil.error(`remoteAndroidEmails detail error, detail: ${r.detail}, time: ${new Date()}`);
      callback && callback({});
    }, function(err){
      err && LogUtil.error(`remoteAndroidEmails find error, time: ${new Date()}`);
      err && callback && callback({});
    });
  },
  doEmail(){
    LogUtil.log('begin doEmail skynet data!');
    var etp = map.emailToProjects, html = '', temp = '';
    var {errors, memories, res, timings} = map;
    Object.keys(etp).forEach((email) => {
      html = [];
      etp[email].forEach((project) => {
        temp = ''
        temp += errors[project] ? this.listToHtml(errors[project]) : '';
        temp += memories[project] ? this.listToHtml(memories[project]) : '';
        temp += res[project] ? this.listToHtml(res[project]) : '';
        temp += timings[project] ? this.listToHtml(timings[project]) : '';
        if(temp){
          html.push(temp);
        }
      });
      if(html && html.length){
        html = this.getPrefixHtml() + html.join(this.emptyToHtml()) + this.getEndHtml();
        this.send([{data: html, alternative:true}], email);
      }
    });
    LogUtil.log('begin doEmail projects!');
    if(newProjects.length){
      this.send([{data: `新增项目：${newProjects.join(', ')}`, alternative:true}], 'Shell Hong <guangjie@meizu.com>');
    }
  }
};

EmailDeal.init();

module.exports = EmailDeal;
