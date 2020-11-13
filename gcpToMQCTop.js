// Debug for segfaults (Linux)
//const SegfaultHandler = require('segfault-handler');
//SegfaultHandler.registerHandler('crash.log');

'use strict';

/**
 * This application demonstrates how to read from GPS and write to MQ Topic client connection
 * Author David Medley 27 Oct 2020
 */

// sample-metadata:
//   title: GCP Pub Sub to MQ Topic (client binding)
//   description: Listens for messages from a subscription, then puts them to MQ as a topic.
//   usage: node gcpToMQCTop.js <subscription-name> <mq-topic> <connection> <channel> [ <user> <password> ]

// Import the MQ package
var mq = require('ibmmq');
var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// Imports the Google Cloud client library
const {PubSub} = require('@google-cloud/pubsub');

var subscriptionName;
var topicString;
var connectionName;
var channelName;
var qMgr;
var mqError;
var user;
var password;
const timeout = 180;

// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
if (myArgs[6]) {
    subscriptionName = myArgs[0];
    topicString  = myArgs[1];
    connectionName  = myArgs[2];
    channelName  = myArgs[3];
    qMgr  = myArgs[4];
    user  = myArgs[5];
    password  = myArgs[6];
} else if (myArgs[4]) {
    subscriptionName = myArgs[0];
    topicString  = myArgs[1];
    connectionName  = myArgs[2];
    channelName  = myArgs[3];
    qMgr  = myArgs[4];
} else {
    throw 'Incorrect number of inputs.';
}

function main() {
    // [START pubsub_subscriber_async_pull]
    // [START pubsub_quickstart_subscriber]


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
            putToMQCTop(message);

            messageCount += 1;

            // "Ack" (acknowledge receipt of) the message
            if (!mqError) {
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

function putToMQCTop(message) {

    mqError = false;

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

    // The TLS parameters are the minimal set needed here. You might
    // want more control such as SSLPEER values.
    // This SSLClientAuth setting means that this program does not need to
    // present a certificate to the server - but it must match how the
    // SVRCONN is defined on the queue manager.
    // If you have to present a client certificate too then the
    // SSLClientAuth is set to MQC.MQSCA_REQUIRED. You may
    // also want to set the sco.CertificateLabel to choose  
    // which certificate is to be sent.
    //cd.SSLCipherSpec = "TLS_RSA_WITH_AES_128_CBC_SHA256";
    //cd.SSLClientAuth = MQC.MQSCA_OPTIONAL;

    // Make the MQCNO refer to the MQCD
    cno.ClientConn = cd;

    // Set the SSL/TLS Configuration Options structure field that
    // specifies the keystore (expect to see a .kdb, .sth and .rdb
    // with the same root name). For this program, all we need is for
    // the keystore to contain the signing information for the queue manager's
    // cert.
    //sco.KeyRepository = "./mykey";

    // And make the CNO refer to the SSL Connection Options
    //cno.SSLConfig = sco;
        
    mq.Connx(qMgr, cno, function(err,hConn) {
        if (err) {
            console.error(formatErr(err));
            mqError = true;
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
                    mqError = true;
                } else {
                    console.log("MQOPEN of %s successful",topicString);
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
                            mqError = true;
                        } else {
                            console.log("MQPUT successful");
                        }
                    });
                    //setImmediate(publishMessage);
                }
                cleanup(hConn,hObj);
                return true;            
            });
        }
    });
}

// Define some functions that will be used from the main flow

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


main();
