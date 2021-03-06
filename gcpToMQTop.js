// Debug for segfaults (Linux)
// const SegfaultHandler = require('segfault-handler');
// SegfaultHandler.registerHandler('crash.log');

/**
 * This application demonstrates how to read from GPS and write to MQ
 * Author David Medley 13 Oct 2020
 */

'use strict';

// sample-metadata:
//   title: GCP Pub Sub to MQ Topic
//   description: Listens for messages from a subscription, then puts them to MQ as a topic.
//   usage: node gcpToMQTop.js <subscription-name> <mq-topic> <mq-queue-manager>

// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity
var subscriptionName;
var topicString;
var qMgr;
const timeout = 180;

// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
if (myArgs[2]) {
    subscriptionName = myArgs[0];
    topicString  = myArgs[1];
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

    function listenForMessages() {
        // References an existing subscription
        const subscription = pubSubClient.subscription(subscriptionName);

        // Create an event handler to handle messages
        let messageCount = 0;
        const messageHandler = message => {
            console.log(`Received message ${message.id}:`);

            // Put to MQ
            async function putToMQTop(message) {
            
                //Set local Binding
                var cno = new mq.MQCNO();
                cno.Options = MQC.MQCNO_NONE;
            
                mq.Connx(qMgr, cno, function(err,hConn) {
                    if (err) {
                        console.error(formatErr(err));
                    } else {
                        console.log("MQCONN to %s successful ", qMgr);
            
                        // Define what we want to open, and how we want to open it.
                        //
                        // For this sample, we use only the ObjectString, though it is possible
                        // to use the ObjectName to refer to a topic Object (ie something
                        // that shows up in the DISPLAY TOPIC list) and then that
                        // object's TopicStr attribute is used as a prefix to the TopicString
                        // value supplied here.
                        // Remember that the combined TopicString attribute has to match what
                        // the subscriber is using.
                        var od = new mq.MQOD();
                        od.ObjectString = topicString;
                        od.ObjectType = MQC.MQOT_TOPIC;
                        var openOptions = MQC.MQOO_OUTPUT;
                        mq.Open(hConn,od,openOptions,function(err,hObj) {
                            if (err) {
                                console.error(formatErr(err));
                            } else {
                                console.log("MQOPEN of %s successful",topicString);
                                publishMessage(hObj,message);
                            }
                            cleanup(hConn,hObj);
                        });
                    }
                });
            }

            putToMQTop().catch(console.error);

            messageCount += 1;

            // "Ack" (acknowledge receipt of) the message
            if (!console.error) {
                message.ack();
            }
        };

        // Listen for new messages until timeout is hit
        subscription.on('message', messageHandler);

        setTimeout(() => {
            subscription.removeListener('message', messageHandler);
            console.log(`${messageCount} message(s) received.`);
        }, timeout * 1000);
    }

    listenForMessages();
    // [END pubsub_subscriber_async_pull]
    // [END pubsub_quickstart_subscriber]
}

// Define some functions that will be used from the main flow
function publishMessage(hObj, message) {

    // Pass data from GCP to MQ
    var msg = formatMsg(message);

    var mqmd = new mq.MQMD(); // Defaults are fine.
    var pmo = new mq.MQPMO();

    // Describe how the Publish (Put) should behave
    pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
        MQC.MQPMO_NEW_MSG_ID |
        MQC.MQPMO_NEW_CORREL_ID;
    // Add in the flag that gives a warning if none is
    // subscribed to this topic.
    pmo.Options |= MQC.MQPMO_WARN_IF_NO_SUBS_MATCHED;
    mq.Put(hObj,mqmd,pmo,msg,function(err) {
        if (err) {
            console.error(formatErr(err));
        } else {
            console.log("MQPUT successful");
        }
    });
    //setImmediate(publishMessage);
}

// Wrap JSON with origin ID
function formatMsg(msg) {
    return  '"googleID": ' + msg.id + String.fromCharCode(13) + '"Content": {' + String.fromCharCode(13) + msg.data + '}';
}

// When we're done, close topics and connections
function cleanup(hConn,hObj) {
    mq.Close(hObj, 0, function(err) {
        if (err) {
            console.error(formatErr(err));
        } else {
            console.log("MQCLOSE successful");
        }
        mq.Disc(hConn, function(err) {
            if (err) {
                console.error(formatErr(err));
            } else {
                console.log("MQDISC successful");
            }
        });
    });
}

function formatErr(err) {
    // if (err.mqcc == MQC.MQCC_WARNING)
    //     return  "MQ call returned warning in " + err.message;
    // else
    return  "MQ call failed in " + err.message;
}

//console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS);

main();
