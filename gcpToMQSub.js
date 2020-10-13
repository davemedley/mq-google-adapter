/**
 * This application demonstrates how to read from GPS and write to MQ
 * Author David Medley 12 Oct 2020
 */

'use strict';

// sample-metadata:
//   title: Listen For Messages
//   description: Listens for messages from a subscription, then puts them to MQ as a message to a defined queue.
//   usage: node listenForMessages.js <subscription-name> <mq-queue> <mq-queue-manager>

// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// The queue manager and queue to be used. These can be overridden on command line.
// var qMgr = "QM1";
// var qName = "DEV.QUEUE.1";

function formatErr(err) {
    return  "MQ call failed in " + err.message;
}

function toHexString(byteArray) {
    return byteArray.reduce((output, elem) =>
            (output + ('0' + elem.toString(16)).slice(-2)),
        '');
}

// Define some functions that will be used from the main flow
function putMessage(hObj, message) {

    // Pass data from GCP to MQ
    var msg = message.data;

    var mqmd = new mq.MQMD(); // Defaults are fine.
    var pmo = new mq.MQPMO();

    // Describe how the Put should behave
    pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
        MQC.MQPMO_NEW_MSG_ID |
        MQC.MQPMO_NEW_CORREL_ID;

    //mqmd.ApplIdentityData = message.id;

    mq.Put(hObj,mqmd,pmo,msg,function(err) {
        if (err) {
            console.log(formatErr(err));
        } else {
            console.log("MQ MsgId: " + toHexString(mqmd.MsgId));
            console.log(`GCP Id: ${message.id}:`);
            console.log("MQPUT successful");
        }
    });
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

function putToMQ(message,qName,qMgr) {

    //Set local Binding
    var cno = new mq.MQCNO();
    cno.Options = MQC.MQCNO_NONE;

    mq.Connx(qMgr, cno, function(err,hConn) {
        if (err) {
            console.log(formatErr(err));
        } else {
            console.log("MQCONN to %s successful ", qMgr);

            // Define what we want to open, and how we want to open it.
            var od = new mq.MQOD();
            od.ObjectName = qName;
            od.ObjectType = MQC.MQOT_Q;
            var openOptions = MQC.MQOO_OUTPUT;
            mq.Open(hConn,od,openOptions,function(err,hObj) {
                if (err) {
                    console.log(formatErr(err));
                } else {
                    console.log("MQOPEN of %s successful",qName);
                    putMessage(hObj,message);
                }
                cleanup(hConn,hObj);
            });
        }
    });
}

function main(subscriptionName = 'YOUR_SUBSCRIPTION_NAME', qName = 'QUEUE_NAME', qMgr = 'QUEUE_MGR_NAME') {
    // [START pubsub_subscriber_async_pull]
    // [START pubsub_quickstart_subscriber]

    // Imports the Google Cloud client library
    const {PubSub} = require('@google-cloud/pubsub');

    // Creates a client; cache this for further use
    const pubSubClient = new PubSub();

    const queue = qName;
    const queueMgr = qMgr;

    function listenForMessages() {
        // References an existing subscription
        const subscription = pubSubClient.subscription(subscriptionName);

        // Create an event handler to handle messages
        let messageCount = 0;
        const messageHandler = message => {
            console.log(`Received message ${message.id}:`);
            // console.log(`\tData: ${message.data}`);
            // console.log(`\tAttributes: ${message.attributes}`);

            // Put to MQ
            putToMQ(message,queue,queueMgr);

            messageCount += 1;

            // "Ack" (acknowledge receipt of) the message
            message.ack();
        };

        // Listen for new messages until timeout is hit
        subscription.on('message', messageHandler);

        // setTimeout(() => {
        //     subscription.removeListener('message', messageHandler);
        //     console.log(`${messageCount} message(s) received.`);
        // }, timeout * 1000);
    }

    listenForMessages();
    // [END pubsub_subscriber_async_pull]
    // [END pubsub_quickstart_subscriber]
}

main(...process.argv.slice(2));