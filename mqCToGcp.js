// Debug for segfaults (Linux)
//const SegfaultHandler = require('segfault-handler');
//SegfaultHandler.registerHandler('crash.log');

'use strict';

/**
 * This application demonstrates how to read from MQ Queue client connection and write to Google Pub/Sub 
 * Author David Medley 16 Nov 2020
 */

// sample-metadata:
//   title: MQ Queue (client binding) to GCP Topic
//   description: Listens for messages on MQ, then puts them to GCP
//   usage: node mqCToGcp.js <subscription-name> <mq-queue> <connection> <channel> <qmgr>


// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// Import any other packages needed
var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');


// The queue manager and queue to be used
var topicName;
var connectionName;
var channelName;
var qMgr;
var qName;
var mqError;
var user;
var password;

var msgId = null;

// Some global variables
var connectionHandle;
var queueHandle;

var waitInterval = 3; // max seconds to wait for a new message
var ok = true;
var exitCode = 0;

var data;

/*
 * Format any error messages
 */
function formatErr(err) {
  if (err) {
    ok = false;
    return "MQ call failed at " + err.message;
  } else {
    return "MQ call successful";
  }
}

function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}


/*
 * Define which messages we want to get, and how.
 */
function getMessages() {
  var md = new mq.MQMD();
  var gmo = new mq.MQGMO();

  gmo.Options = MQC.MQGMO_NO_SYNCPOINT |
                MQC.MQGMO_WAIT |
                MQC.MQGMO_CONVERT |
                MQC.MQGMO_FAIL_IF_QUIESCING;
  gmo.MatchOptions = MQC.MQMO_NONE;
  gmo.WaitInterval = waitInterval * 1000; // 3 seconds

  if (msgId != null) {
     console.log("Setting Match Option for MsgId");
     gmo.MatchOptions = MQC.MQMO_MATCH_MSG_ID;
     md.MsgId = hexToBytes(msgId);
  }

  // Set up the callback handler to be invoked when there
  // are any incoming messages. As this is a sample, I'm going
  // to tune down the poll interval from default 10 seconds to 0.5s.
  mq.setTuningParameters({getLoopPollTimeMs: 500});
  mq.Get(queueHandle,md,gmo,getCB);

}

/*
 * This function is the async callback. Parameters
 * include the message descriptor and the buffer containing
 * the message data.
 */
function getCB(err, hObj, gmo,md,buf, hConn ) {
   // If there is an error, prepare to exit by setting the ok flag to false.
   if (err) {
     if (err.mqrc == MQC.MQRC_NO_MSG_AVAILABLE) {
       console.log("No more messages available.");
     } else {
       console.log(formatErr(err));
       exitCode = 1;
     }
     ok = false;
     // We don't need any more messages delivered, so cause the
     // callback to be deleted after this one has completed.
     mq.GetDone(hObj);
   } else {
     // Successful read

      // [START pubsub_publish_custom_attributes]
      
      if (md.Format=="MQSTR") {
        console.log("Message: " + decoder.write(buf));
        data = JSON.stringify(decoder.write(buf));
      } else {
        console.log("Message: " + buf);
        data = JSON.stringify(buf);
      }
      
      // const topicName = 'YOUR_TOPIC_NAME';
      //const data = JSON.stringify(decoder.write(buf));

      // Imports the Google Cloud client library
      const {PubSub} = require('@google-cloud/pubsub');

      // Creates a client; cache this for further use
      const pubSubClient = new PubSub();

      async function publishMessageWithCustomAttributes() {
        // Publishes the message as a string, e.g. "Hello, world!" or JSON.stringify(someObject)
        const dataBuffer = Buffer.from(data);

        // Add two custom attributes, origin and username, to the message
        const customAttributes = {
          origin: 'ibm-mq',
          msgId: toString(md.MsgId),
        };

        const messageId = await pubSubClient
          .topic(topicName)
          .publish(dataBuffer, customAttributes);
        console.log(`Message ${messageId} published.`);
      }

      publishMessageWithCustomAttributes().catch(console.error);
      // [END pubsub_publish_custom_attributes]

  }
}

/*
 * When we're done, close any queues and connections.
 */
function cleanup(hConn,hObj) {
  mq.Close(hObj, 0, function(err) {
    if (err) {
      console.log(formatErr(err));
    } else {
      console.log("MQCLOSE successful");
    }
    mq.Disc(hConn, function(err) {
      if (err) {
        console.log(formatErr(err));
      } else {
        console.log("MQDISC successful");
      }
    });
  });
}

/**************************************************************
 * The program really starts here.
 * Connect to the queue manager. If that works, the callback function
 * opens the queue, and then we can start to retrieve messages.
 */

// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
if (myArgs[6]) {
    topicName = myArgs[0];
    qName  = myArgs[1];
    connectionName  = myArgs[2];
    channelName  = myArgs[3];
    qMgr = myArgs[4];
    user  = myArgs[5];
    password  = myArgs[6];    
} else if (myArgs[4]) {
    topicName = myArgs[0];
    qName  = myArgs[1];
    connectionName  = myArgs[2];
    channelName  = myArgs[3];
    qMgr  = myArgs[4];
} else {
    throw 'Incorrect number of inputs.';
}

mq.setTuningParameters({syncMQICompat:true});

// Connect to the queue manager, including a callback function for
// when it completes.

// Create default MQCNO structure
var cno = new mq.MQCNO();

// Add authentication via the MQCSP structure
if (user) {
    var csp = new mq.MQCSP();
    csp.UserId = user;
    csp.Password = password;
    // Make the MQCNO refer to the MQCSP
    // This line allows use of the userid/password
    cno.SecurityParms = csp;
}

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

     connectionHandle = hConn;

     // Define what we want to open, and how we want to open it.
     var od = new mq.MQOD();
     od.ObjectName = qName;
     od.ObjectType = MQC.MQOT_Q;
     var openOptions = MQC.MQOO_INPUT_AS_Q_DEF;
     mq.Open(hConn,od,openOptions,function(err,hObj) {
       queueHandle = hObj;
       if (err) {
         console.log(formatErr(err));
       } else {
         console.log("MQOPEN of %s successful",qName);
         // And now we can ask for the messages to be delivered.
         getMessages();
       }
     });
   }
});

// We need to keep the program active so that the callbacks from the
// message handler are processed. This is one way to do it. Use the
// defined waitInterval with a bit extra added and look for the
// current status. If not OK, then close everything down cleanly.
setInterval(function() {
  if (!ok) {
     console.log("Exiting ...");
     cleanup(connectionHandle,queueHandle);
     process.exit(exitCode);
  }
}, (waitInterval + 2 ) * 1000);
