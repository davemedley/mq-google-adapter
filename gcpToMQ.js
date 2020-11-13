// Debug for segfaults (Linux)
// const SegfaultHandler = require('segfault-handler');
// SegfaultHandler.registerHandler('crash.log');

/**
 * This application reads from Google PubSub and write to MQ
 * Author David Medley 12 Oct 2020
 */

'use strict';

// sample-metadata:
//   title: GCP Pub Sub to MQ fixed Queue
//   description: Listens for messages from a subscription, then puts them to MQ as a message.
//   usage: node gcpToMQ.js <subscription-name> <mq-queue> <mq-queue-manager>

// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity
var subscriptionName;
var qName;
var qMgr;
const timeout = 180;

// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
if (myArgs[2]) {
    subscriptionName = myArgs[0];
    qName  = myArgs[1];
    qMgr  = myArgs[2];
} else {
    throw 'Incorrect number of inputs.';
}

function main() {
    // [START pubsub_subscriber_async_pull]
    // [START pubsub_quickstart_subscriber]

    // Imports the Google Cloud client library
    const {PubSub} = require('@google-cloud/pubsub');

    // Creates a client; cache this for further use
    const pubSubClient = new PubSub();

    var success = 'TRUE';

    function listenForMessages() {
        // References an existing subscription
        const subscription = pubSubClient.subscription(subscriptionName);

        // Create an event handler to handle messages
        let messageCount = 0;
        const messageHandler = message => {
            console.log(`Received GCP message ${message.id}:`);

            messageCount += 1;

            // Put to MQ
           putToMQ(message);

            // "Ack" (acknowledge receipt of) the message
            message.ack();

        };

        // Listen for new messages until timeout is hit
        subscription.on('message', messageHandler);

        // Setting a timeout, copied out
        // setTimeout(() => {
        //     subscription.removeListener('message', messageHandler);
        //     console.log(`${messageCount} message(s) received.`);
        // }, timeout * 1000);
    }

    listenForMessages();
    // [END pubsub_subscriber_async_pull]
    // [END pubsub_quickstart_subscriber]
}

// Function
function putToMQ(message,qName,qMgr) {

    //Set local Binding
    var cno = new mq.MQCNO();
    cno.Options = MQC.MQCNO_NONE;

    mq.Connx(qMgr, cno, function(err,hConn) {
        if (err) {
            console.log(formatErr(err));
            return err;
        } else {
            console.log("MQCONN to %s successful ", qMgr);

            // Define what we want to open, and how we want to open it.
            var od = new mq.MQOD();
            od.ObjectName = qName;
            od.ObjectType = MQC.MQOT_Q;
            var openOptions = MQC.MQOO_OUTPUT;
            mq.Open(hConn,od,openOptions,function(err,hObj) {
                if (err) {
                    //console.log(formatErr(err));
                    throw formatErr(err);
                } else {
                    console.log("MQOPEN of %s successful",qName);
                    putMessage(hObj,message);
                }
                cleanup(hConn,hObj);
            });
        }
    });
    setImmediate(putToMQ);
}

// Define some functions that will be used from the main flow
function putMessage(hObj, message) {

    // Pass data from GCP to MQ
    var msg = formatMsg(message);

    var mqmd = new mq.MQMD(); // Defaults are fine.
    var pmo = new mq.MQPMO();

    // Describe how the Put should behave
    pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
        MQC.MQPMO_NEW_MSG_ID |
        MQC.MQPMO_NEW_CORREL_ID;

    //mqmd.ApplIdentityData = message.id;

    mq.Put(hObj,mqmd,pmo,msg,function(err) {
        if (err) {
            //console.log(formatErr(err))
            throw formatErr(err);
        } else {
            console.log("MQ MsgId: " + toHexString(mqmd.MsgId));
            console.log(`GCP Id: ${message.id}:`);
            //console.log("MQPUT successful");
        }
    })
}

// Wrap JSON with origin ID
function formatMsg(msg) {
    return  '"googleID": ' + msg.id + String.fromCharCode(13) + '"Content": {' + String.fromCharCode(13) + msg.data + '}';
}

function formatErr(err) {
    return  "MQ call failed in " + err.message;
}

function toHexString(byteArray) {
    return byteArray.reduce((output, elem) =>
            (output + ('0' + elem.toString(16)).slice(-2)),
        '');
}

// When we're done, close queues and connections
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

main();
