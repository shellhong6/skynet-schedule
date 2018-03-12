var Emailjs = require('emailjs');
const Schedule = require('node-schedule');

var _server = null;

const _getServer = function(){
  // if(_server){
  //   return _server;
  // }
  _server = Emailjs.server.connect({
     user:	"node_code",
    //  password: "appadmin*111",
     host:	"idcmail.meizu.com"
  });
  return _server;
}

var EmailDeal = {
  init(){
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
        console.error(`send email error: ${to}（${new Date().toString()}）, \nmessage: ${err.message}`);
        return;
      }
       console.log(`send email success: ${to}（${new Date().toString()}）`);
     });
  }
};

EmailDeal.init();

// let startTime = new Date();
// let endTime = new Date(startTime.getTime() + 86400000);
// Schedule.scheduleJob('50 * * * *', function(){
//   EmailDeal.send([{data: new Date().toString(), alternative:true}], 'Shell Hong2 <guangjie@meizu.com>');
// });
EmailDeal.send([{data: new Date().toString(), alternative:true}], 'hello <guangjie@meizu.com>');
// EmailDeal.send([{data: new Date().toString(), alternative:true}], 'Shell Hong1 <guangjie@meizu.com>');
