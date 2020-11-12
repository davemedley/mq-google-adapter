'use strict';

/**
 * This application demonstrates how to read from MQ Topic client connection and write to Google Pub/Sub 
 * Author David Medley 11 Nov 2020
 */

// sample-metadata:
//   title: GCP Pub Sub to MQ Topic (client binding)
//   description: Listens for messages from a subscription, then puts them to MQ as a topic.
//   usage: node mqCTopToGcp.js <subscription-name> <mq-topic> <connection> <channel> <qmgr>

// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// Import any other packages needed
var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

// The queue manager and queue to be used
var subscriptionName;
var topicString;
var connectionName;
var channelName;
var qMgr;
const timeout = 180;
var mqError;

// Global variables
var ok = true;


// Define some functions that will be used from the main flow
function getMessages(hObj) {
  while (ok) {
    getMessage(hObj);
  }
}

// This function retrieves messages from the queue without waiting using
// the synchronous method for simplicity. See amqsgeta for how to use the
// async method.
function getMessage(hObj) {

  var buf = Buffer.alloc(1024);

  var mqmd = new mq.MQMD();
  var gmo = new mq.MQGMO();

  gmo.WaitInterval = 3 * 1000; // 3 seconds
  gmo.Options = MQC.MQGMO_NO_SYNCPOINT |
                MQC.MQGMO_WAIT |
                MQC.MQGMO_CONVERT |
                MQC.MQGMO_FAIL_IF_QUIESCING;

  mq.GetSync(hObj,mqmd,gmo,buf,function(err,len) {
    if (err) {
       if (err.mqrc == MQC.MQRC_NO_MSG_AVAILABLE) {
         console.log("no more messages");
       } else {
         console.log("MQGET failed with " + err.mqrc);
       }
       ok = false;
    } else {
      if (mqmd.Format=="MQSTR") {
        console.log("message <%s>", decoder.write(buf.slice(0,len)));
      } else {
        console.log("binary message: " + buf);
      }
    }
  });
}

// When we're done, close queues and connections
function cleanup(hConn,hObjPubQ, hObjSubscription) {
  // Demonstrate two ways of closing queues - first using an exception, then
  // the version with callback.
  try {
    mq.CloseSync(hObjSubscription,0);
    console.log("MQCLOSE (Subscription) successful");
  } catch (err) {
    console.log("MQCLOSE (Subscription) ended with reason "  + err);
  }

  mq.Close(hObjPubQ, 0, function(err) {
    if (err) {
      console.log("MQCLOSE (PubQ) ended with reason " + err.mqrc);
    } else {
      console.log("MQCLOSE (PubQ) successful");
    }
    mq.Disc(hConn, function(err) {
      if (err) {
        console.log("MQDISC ended with reason " + err.mqrc);
      } else {
        console.log("MQDISC successful");
      }
    });
  });
}

// The program really starts here.
// Connect to the queue manager. If that works, the callback function
// opens the topic, and then we can start to retrieve messages.

// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
if (myArgs[4]) {
    subscriptionName = myArgs[0];
    topicString  = myArgs[1];
    connectionName  = myArgs[2];
    channelName  = myArgs[3];
    qMgr = myArgs[4];    
} else {
    throw 'Incorrect number of inputs.';
}

// Create default MQCNO structure
var cno = new mq.MQCNO();

// Add authentication via the MQCSP structure
var csp = new mq.MQCSP();
csp.UserId = "admin";
csp.Password = "passw0rd";
// Make the MQCNO refer to the MQCSP
// This line allows use of the userid/password
cno.SecurityParms = csp;

// And use the MQCD to programatically connect as a client
// First force the client mode
cno.Options |= MQC.MQCNO_CLIENT_BINDING;
// And then fill in relevant fields for the MQCD
var cd = new mq.MQCD();
cd.ConnectionName = connectionName;
cd.ChannelName = channelName;
// Make the MQCNO refer to the MQCD
cno.ClientConn = cd;

// Do the connect, including a callback function
mq.Connx(qMgr, cno, function(err,hConn)  {
   if (err) {
     console.log("MQCONN ended with reason code " + err.mqrc);
   } else {
     console.log("MQCONN to %s successful ", qMgr);

     // Define what we want to open, and how we want to open it.
     var sd = new mq.MQSD();
     sd.ObjectString = topicString;
     sd.Options =   MQC.MQSO_CREATE
                  | MQC.MQSO_NON_DURABLE
                  | MQC.MQSO_FAIL_IF_QUIESCING
                  | MQC.MQSO_MANAGED;

     mq.Sub(hConn,null,sd,function(err,hObjPubQ,hObjSubscription) {
       if (err) {
         console.log("MQSUB ended with reason " + err.mqrc);
       } else {
         console.log("MQSUB to topic %s successful", topicString);
         // And loop getting messages until done.
         getMessages(hObjPubQ);
       }
       cleanup(hConn,hObjPubQ, hObjSubscription);
     });
   }
});
